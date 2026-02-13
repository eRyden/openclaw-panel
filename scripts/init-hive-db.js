const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'hive.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  repo_path TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  spec TEXT,
  status TEXT DEFAULT 'plan',
  stage TEXT DEFAULT 'plan',
  priority TEXT DEFAULT 'normal',
  greenlit INTEGER DEFAULT 0,
  auto_run INTEGER DEFAULT 0,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 2,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  stage TEXT NOT NULL,
  status TEXT DEFAULT 'running',
  agent_session_key TEXT,
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  duration_ms INTEGER,
  error TEXT,
  output TEXT
);

CREATE TABLE IF NOT EXISTS step_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES pipeline_runs(id),
  timestamp TEXT DEFAULT (datetime('now')),
  level TEXT DEFAULT 'info',
  message TEXT NOT NULL
);
`);

console.log(`Hive database initialized at ${dbPath}`);
