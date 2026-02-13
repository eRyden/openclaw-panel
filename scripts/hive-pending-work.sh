#!/bin/bash
# Query pending pipeline work from Hive
# Returns JSON with greenlit parents that have subtasks ready to run
cd /root/.openclaw/workspace/projects/cron-dashboard

sqlite3 -json data/hive.db "
SELECT 
  p.id as parent_id,
  p.title as parent_title,
  p.project_id,
  p.task_type,
  p.priority,
  p.created_at,
  pr.name as project_name,
  pr.repo_path,
  s.id as subtask_id,
  s.title as subtask_title,
  s.spec as subtask_spec,
  s.stage as subtask_stage,
  s.status as subtask_status
FROM tasks p
JOIN tasks s ON s.parent_id = p.id
JOIN projects pr ON pr.id = p.project_id
WHERE p.greenlit = 1
  AND p.status != 'done'
  AND p.status != 'archived'
  AND s.status IN ('running', 'plan')
  AND s.stage = 'implement'
  AND s.greenlit = 1
ORDER BY 
  CASE p.priority 
    WHEN 'urgent' THEN 0 
    WHEN 'high' THEN 1 
    WHEN 'normal' THEN 2 
    WHEN 'low' THEN 3 
  END,
  p.created_at ASC,
  s.id ASC
;"
