#!/bin/bash
# openspec-autodev: Session Management Utilities
# Provides shared functions for multi-session collaboration support.
# Each session writes its own file (.claude/sessions/<id>.json) — no locking needed.

SESSIONS_DIR=".claude/sessions"

get_session_id() {
  if [ -f ".claude/current-session-id" ]; then
    cat ".claude/current-session-id"
  fi
}

get_session_dir() {
  local sid
  sid=$(get_session_id)
  if [ -n "$sid" ]; then
    echo "${SESSIONS_DIR}/${sid}"
  fi
}

generate_session_id() {
  local user
  user=$(whoami 2>/dev/null || echo "unknown")
  echo "${user}-$(date +%s)"
}

register_session() {
  local sid="$1"
  mkdir -p "${SESSIONS_DIR}/${sid}"

  local now
  now=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")
  local user
  user=$(whoami 2>/dev/null || echo "unknown")

  cat > "${SESSIONS_DIR}/${sid}.json" <<ENDJSON
{
  "id": "${sid}",
  "user": "${user}",
  "startedAt": "${now}",
  "lastActivity": "${now}",
  "feature": null,
  "workflowType": null,
  "branch": null,
  "phase": null,
  "status": "idle",
  "fileClaims": []
}
ENDJSON

  echo "$sid" > ".claude/current-session-id"
}

update_session_field() {
  local sid="$1"
  local field="$2"
  local value="$3"
  local session_file="${SESSIONS_DIR}/${sid}.json"

  if [ ! -f "$session_file" ]; then
    return 1
  fi

  local now
  now=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")

  if command -v python3 &>/dev/null; then
    python3 -c "
import json, sys
with open('${session_file}', 'r') as f:
    data = json.load(f)
data['${field}'] = ${value}
data['lastActivity'] = '${now}'
with open('${session_file}', 'w') as f:
    json.dump(data, f, indent=2)
" 2>/dev/null
  elif command -v node &>/dev/null; then
    node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('${session_file}', 'utf8'));
data['${field}'] = ${value};
data['lastActivity'] = '${now}';
fs.writeFileSync('${session_file}', JSON.stringify(data, null, 2));
" 2>/dev/null
  fi
}

update_heartbeat() {
  local sid
  sid=$(get_session_id)
  if [ -z "$sid" ]; then
    return
  fi

  local session_file="${SESSIONS_DIR}/${sid}.json"
  if [ ! -f "$session_file" ]; then
    return
  fi

  local now
  now=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")

  if command -v python3 &>/dev/null; then
    python3 -c "
import json
with open('${session_file}', 'r') as f:
    data = json.load(f)
data['lastActivity'] = '${now}'
with open('${session_file}', 'w') as f:
    json.dump(data, f, indent=2)
" 2>/dev/null
  elif command -v node &>/dev/null; then
    node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('${session_file}', 'utf8'));
data['lastActivity'] = '${now}';
fs.writeFileSync('${session_file}', JSON.stringify(data, null, 2));
" 2>/dev/null
  fi
}

deregister_session() {
  local sid="$1"
  if [ -z "$sid" ]; then
    sid=$(get_session_id)
  fi
  if [ -n "$sid" ]; then
    rm -f "${SESSIONS_DIR}/${sid}.json"
    rm -rf "${SESSIONS_DIR}/${sid}/"
  fi
  rm -f ".claude/current-session-id"
}

# Check if a file is claimed by another session.
# Returns 0 if no conflict, 1 if conflict (prints the owning session info).
check_file_claim() {
  local file="$1"
  local my_sid
  my_sid=$(get_session_id)

  if [ ! -d "$SESSIONS_DIR" ]; then
    return 0
  fi

  local stale_threshold=1800  # 30 minutes in seconds
  local now_epoch
  now_epoch=$(date +%s)

  for session_file in "${SESSIONS_DIR}"/*.json; do
    [ -f "$session_file" ] || continue

    local other_sid
    other_sid=$(basename "$session_file" .json)

    [ "$other_sid" = "$my_sid" ] && continue

    local last_activity_epoch=0
    if command -v python3 &>/dev/null; then
      last_activity_epoch=$(python3 -c "
import json, datetime, sys
try:
    with open('${session_file}', 'r') as f:
        data = json.load(f)
    ts = data.get('lastActivity', '')
    if ts:
        dt = datetime.datetime.fromisoformat(ts.replace('Z', '+00:00'))
        print(int(dt.timestamp()))
    else:
        print(0)
except:
    print(0)
" 2>/dev/null)
    fi

    # Skip stale sessions (no activity for 30+ minutes)
    if [ "$last_activity_epoch" -gt 0 ] && [ $((now_epoch - last_activity_epoch)) -gt $stale_threshold ]; then
      continue
    fi

    # Check file claims
    local claimed=false
    if command -v python3 &>/dev/null; then
      claimed=$(python3 -c "
import json, fnmatch
with open('${session_file}', 'r') as f:
    data = json.load(f)
claims = data.get('fileClaims', [])
for pattern in claims:
    if fnmatch.fnmatch('${file}', pattern) or '${file}'.startswith(pattern.rstrip('*')):
        print('true')
        break
else:
    print('false')
" 2>/dev/null)
    elif command -v node &>/dev/null; then
      claimed=$(node -e "
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('${session_file}', 'utf8'));
const claims = data.fileClaims || [];
const file = '${file}';
const match = claims.some(c => file.startsWith(c.replace(/\*$/, '')) || file === c);
console.log(match ? 'true' : 'false');
" 2>/dev/null)
    fi

    if [ "$claimed" = "true" ]; then
      local other_user other_feature
      if command -v python3 &>/dev/null; then
        other_user=$(python3 -c "import json; print(json.load(open('${session_file}'))['user'])" 2>/dev/null)
        other_feature=$(python3 -c "import json; print(json.load(open('${session_file}')).get('feature') or 'unknown')" 2>/dev/null)
      fi
      echo "CONFLICT: File '${file}' is claimed by session ${other_sid} (user: ${other_user:-unknown}, feature: ${other_feature:-unknown})"
      return 1
    fi
  done

  return 0
}

list_active_sessions() {
  if [ ! -d "$SESSIONS_DIR" ]; then
    echo "No active sessions."
    return
  fi

  local stale_threshold=1800
  local now_epoch
  now_epoch=$(date +%s)
  local my_sid
  my_sid=$(get_session_id)
  local found=false

  for session_file in "${SESSIONS_DIR}"/*.json; do
    [ -f "$session_file" ] || continue

    local sid
    sid=$(basename "$session_file" .json)

    if command -v python3 &>/dev/null; then
      python3 -c "
import json, datetime
with open('${session_file}', 'r') as f:
    data = json.load(f)
ts = data.get('lastActivity', '')
if ts:
    dt = datetime.datetime.fromisoformat(ts.replace('Z', '+00:00'))
    age = ${now_epoch} - int(dt.timestamp())
    if age > ${stale_threshold}:
        exit(0)  # stale, skip
user = data.get('user', 'unknown')
feature = data.get('feature') or '-'
wtype = data.get('workflowType') or '-'
phase = data.get('phase')
status = data.get('status', 'unknown')
claims = data.get('fileClaims', [])
phase_str = f'Phase {phase}' if phase is not None else '-'
marker = ' ← (you)' if '${sid}' == '${my_sid}' else ''
claims_str = f' [{len(claims)} files claimed]' if claims else ''
print(f'  👤 {user}: {feature} ({wtype}, {phase_str}, {status}){claims_str} — {sid}{marker}')
" 2>/dev/null && found=true
    fi
  done

  if [ "$found" = false ]; then
    echo "  No active sessions."
  fi
}

cleanup_stale_sessions() {
  if [ ! -d "$SESSIONS_DIR" ]; then
    return
  fi

  local stale_threshold=1800
  local now_epoch
  now_epoch=$(date +%s)
  local my_sid
  my_sid=$(get_session_id)

  for session_file in "${SESSIONS_DIR}"/*.json; do
    [ -f "$session_file" ] || continue

    local sid
    sid=$(basename "$session_file" .json)
    [ "$sid" = "$my_sid" ] && continue

    if command -v python3 &>/dev/null; then
      python3 -c "
import json, datetime, sys
with open('${session_file}', 'r') as f:
    data = json.load(f)
ts = data.get('lastActivity', '')
if ts:
    dt = datetime.datetime.fromisoformat(ts.replace('Z', '+00:00'))
    age = ${now_epoch} - int(dt.timestamp())
    if age > ${stale_threshold}:
        sys.exit(0)  # stale
sys.exit(1)  # active
" 2>/dev/null
      if [ $? -eq 0 ]; then
        echo "  🧹 Cleaned stale session: ${sid}"
        rm -f "$session_file"
        rm -rf "${SESSIONS_DIR}/${sid}/"
      fi
    fi
  done
}
