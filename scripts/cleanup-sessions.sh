#!/bin/bash
# Auto-cleanup old completed sub-agent and cron sessions
# Removes sessions that are stale (subagent >10 min, cron >1 hour)

SESSION_FILE="/root/.openclaw/agents/main/sessions/sessions.json"
SUBAGENT_MAX_AGE_MS=$((10 * 60 * 1000))   # 10 minutes
CRON_MAX_AGE_MS=$((60 * 60 * 1000))       # 1 hour
NOW_MS=$(($(date +%s) * 1000))

if [ ! -f "$SESSION_FILE" ]; then
    echo '{"error": "Session file not found", "deleted": []}'
    exit 1
fi

# Find old subagent sessions AND old cron sessions
DELETED=$(jq --argjson now "$NOW_MS" --argjson subMax "$SUBAGENT_MAX_AGE_MS" --argjson cronMax "$CRON_MAX_AGE_MS" '
  to_entries
  | map(select(
      ((.key | contains("subagent")) and (($now - .value.updatedAt) > $subMax)) or
      ((.key | contains("cron:")) and (($now - .value.updatedAt) > $cronMax))
    ))
  | map(.key)
' "$SESSION_FILE")

COUNT=$(echo "$DELETED" | jq 'length')

if [ "$COUNT" -eq "0" ]; then
    echo '{"deleted": [], "count": 0}'
    exit 0
fi

cp "$SESSION_FILE" "${SESSION_FILE}.bak"

jq --argjson now "$NOW_MS" --argjson subMax "$SUBAGENT_MAX_AGE_MS" --argjson cronMax "$CRON_MAX_AGE_MS" '
  with_entries(select(
    (((.key | contains("subagent")) and (($now - .value.updatedAt) > $subMax)) or
     ((.key | contains("cron:")) and (($now - .value.updatedAt) > $cronMax))) | not
  ))
' "$SESSION_FILE" > "${SESSION_FILE}.tmp"

if [ $? -eq 0 ]; then
    mv "${SESSION_FILE}.tmp" "$SESSION_FILE"
    echo "{\"deleted\": $DELETED, \"count\": $COUNT}"
else
    echo '{"error": "Failed to cleanup sessions", "deleted": []}'
    mv "${SESSION_FILE}.bak" "$SESSION_FILE"
    exit 1
fi
