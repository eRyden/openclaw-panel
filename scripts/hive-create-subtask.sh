#!/bin/bash
# Usage: ./scripts/hive-create-subtask.sh <parent_task_id> <project_id> "<title>" "<spec>"
PARENT_ID=$1
PROJECT_ID=$2
TITLE=$3
SPEC=$4

COOKIE=$(curl -s -c - -X POST http://127.0.0.1:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"erik","password":"AtomHQ2026!"}' | grep connect.sid | awk '{print $NF}')

curl -s -X POST http://127.0.0.1:3000/api/hive/tasks \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=$COOKIE" \
  -d "{\"project_id\": $PROJECT_ID, \"title\": \"$TITLE\", \"spec\": \"$SPEC\", \"parent_id\": $PARENT_ID}"
