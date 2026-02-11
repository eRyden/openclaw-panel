#!/bin/bash
# Delete a session from the OpenClaw session store
# Usage: ./delete-session.sh "session-key"

SESSION_KEY="$1"
SESSION_FILE="/root/.openclaw/agents/main/sessions/sessions.json"

if [ -z "$SESSION_KEY" ]; then
    echo '{"error": "No session key provided"}' >&2
    exit 1
fi

if [ ! -f "$SESSION_FILE" ]; then
    echo '{"error": "Session file not found"}' >&2
    exit 1
fi

# Check if session exists
if ! jq -e --arg key "$SESSION_KEY" 'has($key)' "$SESSION_FILE" > /dev/null 2>&1; then
    echo '{"error": "Session not found"}' >&2
    exit 1
fi

# Create backup
cp "$SESSION_FILE" "${SESSION_FILE}.bak"

# Delete the session
if jq --arg key "$SESSION_KEY" 'del(.[$key])' "$SESSION_FILE" > "${SESSION_FILE}.tmp"; then
    mv "${SESSION_FILE}.tmp" "$SESSION_FILE"
    echo '{"success": true, "deleted": "'"$SESSION_KEY"'"}'
else
    echo '{"error": "Failed to delete session"}' >&2
    mv "${SESSION_FILE}.bak" "$SESSION_FILE"
    exit 1
fi
