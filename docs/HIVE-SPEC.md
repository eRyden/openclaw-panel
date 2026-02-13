# Project Hive — Autonomous Task Pipeline

## Overview
An autonomous task pipeline built into the Atom Control Center. Tasks flow through Plan → Implement → Verify → Test → Deploy with zero babysitting. Codex agents do the work, the server orchestrates, Atom intervenes only on failures.

## Database Schema (hive.db)

```sql
-- Project categories
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  repo_path TEXT,              -- e.g. /root/.openclaw/workspace/projects/atomtrader
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Tasks under projects
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  spec TEXT,                   -- Full spec/acceptance criteria (markdown)
  status TEXT DEFAULT 'plan',  -- plan, greenlit, running, done, failed, paused
  stage TEXT DEFAULT 'plan',   -- plan, implement, verify, test, deploy, done
  priority TEXT DEFAULT 'normal', -- low, normal, high, urgent
  greenlit INTEGER DEFAULT 0,  -- toggle: 0=waiting, 1=approved to run
  auto_run INTEGER DEFAULT 1,  -- auto-advance through pipeline
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 2,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT
);

-- Pipeline execution runs
CREATE TABLE pipeline_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  stage TEXT NOT NULL,          -- implement, verify, test, deploy
  status TEXT DEFAULT 'running', -- running, passed, failed, retrying
  agent_session_key TEXT,       -- OpenClaw session key for the agent
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  duration_ms INTEGER,
  error TEXT,
  output TEXT                   -- Agent summary/findings
);

-- Step logs for detailed tracking
CREATE TABLE step_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES pipeline_runs(id),
  timestamp TEXT DEFAULT (datetime('now')),
  level TEXT DEFAULT 'info',    -- info, warn, error, success
  message TEXT NOT NULL
);
```

## API Endpoints

### Projects
- `GET    /api/hive/projects` — list all projects
- `POST   /api/hive/projects` — create project `{ name, description, repo_path }`
- `PUT    /api/hive/projects/:id` — update project
- `DELETE /api/hive/projects/:id` — delete project (only if no tasks)

### Tasks
- `GET    /api/hive/tasks` — list tasks (filter by ?project_id, ?status, ?stage)
- `GET    /api/hive/tasks/:id` — get task with pipeline_runs and step_logs
- `POST   /api/hive/tasks` — create task `{ project_id, title, spec, priority }`
- `PUT    /api/hive/tasks/:id` — update task (title, spec, priority)
- `DELETE /api/hive/tasks/:id` — delete task
- `POST   /api/hive/tasks/:id/greenlight` — toggle greenlit, starts pipeline if auto_run
- `POST   /api/hive/tasks/:id/pause` — pause a running pipeline
- `POST   /api/hive/tasks/:id/retry` — retry failed task from failed stage

### Pipeline Control (called by agents)
- `POST   /api/hive/pipeline/:taskId/advance` — mark current step done, spawn next
  - Body: `{ output: "summary of what was done" }`
- `POST   /api/hive/pipeline/:taskId/fail` — mark current step failed
  - Body: `{ error: "what went wrong" }`

### Dashboard
- `GET    /api/hive/dashboard` — aggregated view: tasks grouped by stage, counts, active runs

## Pipeline Engine

### Flow
```
User greenlights task
  → Server creates pipeline_run for 'implement' stage
  → Server calls OpenClaw sessions_spawn with Codex model
  → Agent works in git worktree
  → Agent calls /api/hive/pipeline/:taskId/advance on success
  → Server creates next pipeline_run for 'verify' stage
  → Spawns verify agent... and so on
  → After 'deploy' passes: merge to main, pm2 restart, notify Discord
```

### Agent Instructions Template
Each agent gets:
1. The task spec (acceptance criteria)
2. The repo path and worktree branch
3. Previous step output (what was implemented/found)
4. Their specific role instructions
5. The callback URLs (/advance and /fail)
6. "You are a coding agent. Implement ALL changes directly. Do NOT spawn sub-agents."

### Failure Handling
1. Agent calls /fail with error details
2. Server checks retry_count < max_retries
3. If retries left: spawn new agent with error context ("Previous attempt failed because X. Fix it.")
4. If retries exhausted: alert Atom (system event) to investigate
5. If Atom can't fix: alert Erik in Discord

### Stage-Specific Agent Roles

**Implement:**
- Gets: task spec, repo path, worktree branch
- Does: writes code, commits to branch
- Reports: files changed, what was built

**Verify:**
- Gets: task spec, diff from implement step, repo path
- Does: reviews code against spec, checks for bugs, ID mismatches, missing error handling
- Reports: pass/fail with specific issues found

**Test:**
- Gets: task spec, repo path with implemented code
- Does: starts server (if needed), hits endpoints, checks responses, verifies UI elements exist
- Reports: pass/fail with test results

**Deploy:**
- Gets: repo path, branch to merge
- Does: merges branch to main, runs any migrations, restarts PM2
- Reports: deployment status, any errors

## Dashboard UI

### Layout
- Replaces current Projects page on Control Center
- Kanban board with columns: Plan | Implement | Verify | Test | Deploy | Done
- Project filter tabs across the top (All, AtomTrader, Control Center, etc.)
- Cards in each column show: task title, project name, priority badge, timing

### Card Design
- Compact card: title, project tag, priority color, elapsed time
- Click → slide-out panel with: full spec, step logs, agent output, timing per step
- Green-light toggle button on Plan cards
- Pause/retry buttons on active/failed cards

### Real-time Updates
- Poll /api/hive/dashboard every 3 seconds
- Animate card transitions between columns (CSS transitions)
- Pulse animation on actively running cards
- Sound/notification on completion (optional)

### Color Scheme
- Matches Control Center theme (#0f1729 background, slate cards)
- Stage columns: subtle color-coded headers
- Priority badges: gray (low), blue (normal), amber (high), red (urgent)
- Status indicators: green pulse (running), green check (done), red X (failed), yellow pause (paused)
