#!/bin/bash
# Usage: ./scripts/hive-advance-task.sh <task_id> "<output_summary>"
TASK_ID=$1
OUTPUT=$2

COOKIE=$(curl -s -c - -X POST http://127.0.0.1:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"erik","password":"AtomHQ2026!"}' | grep connect.sid | awk '{print $NF}')

curl -s -X POST "http://127.0.0.1:3000/api/hive/pipeline/$TASK_ID/advance" \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=$COOKIE" \
  -d "{\"output\": \"$OUTPUT\"}"
