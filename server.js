require('dotenv').config();
const express = require('express');
const { exec, spawn } = require('child_process');
const http = require('http');
const path = require('path');
const session = require('express-session');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

// Load config.json with fallback to defaults
let config = {};
try {
  config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
} catch {
  // Config file not found or invalid, use defaults
}

const app = express();
const PORT = process.env.PORT || 3000;

// Credentials from environment variables
const AUTH_USER = process.env.AUTH_USER || 'admin';
const AUTH_PASS = process.env.AUTH_PASS || 'changeme';
const SESSION_SECRET = process.env.SESSION_SECRET || 'openclaw-panel-' + Date.now();

// Panel configuration
const PANEL_NAME = config.panelName || process.env.PANEL_NAME || 'Control Center';
const PANEL_ICON = config.panelIcon || process.env.PANEL_ICON || 'atom';

// Hive database
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const hiveDbPath = path.join(dataDir, 'hive.db');
const hiveDb = new Database(hiveDbPath);
hiveDb.pragma('journal_mode = WAL');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Set to true if using HTTPS proxy that forwards correctly
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// Static assets (unprotected - for login page styling)
app.use('/assets', express.static(path.join(__dirname, 'public/assets')));
app.use('/atom-logo.png', express.static(path.join(__dirname, 'public/atom-logo.png')));

// Login page
const loginHtml = fs.readFileSync(path.join(__dirname, 'public', 'login.html'), 'utf8');

app.get('/login', (req, res) => {
  if (req.session.authenticated) {
    return res.redirect('/');
  }
  res.type('html').send(loginHtml);
});

// Login handler
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === AUTH_USER && password === AUTH_PASS) {
    req.session.authenticated = true;
    req.session.user = username;
    res.redirect('/');
  } else {
    res.redirect('/login?error=1');
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Auth middleware for protected routes
function requireAuth(req, res, next) {
  if (req.session.authenticated) {
    next();
  } else {
    res.redirect('/login');
  }
}

// Serve index.html with dynamic panel name
app.get('/', requireAuth, (req, res) => {
  const indexHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  const dynamicHtml = indexHtml
    .replace(/{{PANEL_NAME}}/g, PANEL_NAME)
    .replace(/{{PANEL_ICON}}/g, PANEL_ICON);
  res.type('html').send(dynamicHtml);
});

// Protected static files
app.use(requireAuth, express.static(path.join(__dirname, 'public')));

// Helper to run openclaw commands
function runOpenClaw(cmd) {
  return new Promise((resolve, reject) => {
    exec(`openclaw ${cmd}`, { timeout: 60000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve({ raw: stdout });
      }
    });
  });
}

// Simple cache for slow commands
const cache = { data: {}, ts: {} };
const CACHE_TTL = 120000; // 2 minutes

function getCached(key) {
  if (cache.data[key] && Date.now() - cache.ts[key] < CACHE_TTL) {
    return cache.data[key];
  }
  return null;
}

function setCache(key, data) {
  cache.data[key] = data;
  cache.ts[key] = Date.now();
}

// Discord channel ID to name mapping (from config.json)
const CHANNEL_NAMES = config.discordChannels || {};

// Legacy topic name mapping (deprecated)
const TOPIC_NAMES = {
  '1': 'General',
  '26': 'Trading',
  '27': 'Primortal',
  '28': 'Config',
  '378': 'Coding'
};

// Format session key to human-readable name
function formatSessionName(key) {
  // Check for Discord channel IDs
  for (const [channelId, name] of Object.entries(CHANNEL_NAMES)) {
    if (key.includes(channelId)) {
      return name;
    }
  }
  
  // Main session
  if (key === 'agent:main:main' || key.endsWith(':main:main')) {
    return 'Main (Heartbeat)';
  }
  
  // Sub-agent pattern
  if (key.includes('subagent')) {
    const parts = key.split(':');
    const uuid = parts[parts.length - 1];
    return 'Sub-agent: ' + uuid.substring(0, 8);
  }
  
  // Cron job pattern - extract UUID and try to match job name
  if (key.includes('cron:')) {
    const cronMatch = key.match(/cron:([a-f0-9-]+)/);
    if (cronMatch) {
      const jobId = cronMatch[1];
      // Try to find job name from cached jobs
      const cachedJobs = getCached('jobs');
      if (cachedJobs && cachedJobs.jobs) {
        const job = cachedJobs.jobs.find(j => j.id === jobId);
        if (job && job.name) return `Cron: ${job.name}`;
      }
      return `Cron: ${jobId.substring(0, 8)}`;
    }
    return 'Cron Job';
  }
  
  // Legacy topic matching
  const topicMatch = key.match(/topic:(\d+)/);
  if (topicMatch && TOPIC_NAMES[topicMatch[1]]) {
    return TOPIC_NAMES[topicMatch[1]];
  }
  
  // Fallback: truncate intelligently
  if (key.length > 30) {
    const parts = key.split(':');
    if (parts.length > 2) {
      return parts.slice(-2).join(':').substring(0, 25) + '…';
    }
    return key.substring(0, 27) + '…';
  }
  
  return key;
}

// API Routes (all protected)
app.get('/api/jobs', requireAuth, async (req, res) => {
  try {
    const cached = getCached('jobs');
    if (cached) return res.json(cached);
    
    const data = await runOpenClaw('cron list --json --all');
    const jobs = (data.jobs || []).map(job => {
      let model = 'Opus 4.5';
      if (job.payload?.model) model = job.payload.model;
      else if (job.sessionTarget === 'main') model = 'Opus 4.5 (main)';
      else if (job.sessionTarget === 'isolated') model = 'Opus 4.5 (isolated)';
      return { ...job, model };
    });
    
    const result = { jobs };
    setCache('jobs', result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/jobs/:id/run', requireAuth, async (req, res) => {
  try {
    const data = await runOpenClaw(`cron run ${req.params.id}`);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/jobs/:id/enable', requireAuth, async (req, res) => {
  try {
    await runOpenClaw(`cron enable ${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/jobs/:id/disable', requireAuth, async (req, res) => {
  try {
    await runOpenClaw(`cron disable ${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/jobs/:id/runs', requireAuth, async (req, res) => {
  try {
    const data = await runOpenClaw(`cron runs ${req.params.id}`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/status', requireAuth, async (req, res) => {
  try {
    const cached = getCached('status');
    if (cached) return res.json(cached);
    
    const [versionResult, gatewayStatus, cronStatus] = await Promise.all([
      new Promise((resolve, reject) => {
        exec('openclaw --version', (error, stdout) => {
          if (error) reject(error);
          else resolve(stdout.trim());
        });
      }),
      runOpenClaw('gateway status --json'),
      runOpenClaw('cron status --json')
    ]);

    let uptime = 'Unknown';
    if (gatewayStatus.service?.runtime?.pid) {
      const pid = gatewayStatus.service.runtime.pid;
      try {
        const psResult = await new Promise((resolve, reject) => {
          exec(`ps -p ${pid} -o etimes=`, (error, stdout) => {
            if (error) reject(error);
            else resolve(parseInt(stdout.trim()));
          });
        });
        const seconds = psResult;
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (days > 0) uptime = `${days}d ${hours}h`;
        else if (hours > 0) uptime = `${hours}h ${minutes}m`;
        else uptime = `${minutes}m`;
      } catch { uptime = 'Active'; }
    }

    const result = {
      version: versionResult,
      uptime,
      sessionCount: cronStatus.jobs || 0,
      model: 'Opus 4.5',
      gatewayStatus: gatewayStatus.service?.runtime?.status || 'unknown'
    };
    setCache('status', result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sessions', requireAuth, async (req, res) => {
  try {
    const cached = getCached('sessions');
    if (cached) return res.json(cached);
    
    const sessionData = await runOpenClaw('sessions list --json');
    let cronJobNames = {};
    const cachedJobs = getCached('jobs');
    if (cachedJobs) {
      (cachedJobs.jobs || []).forEach(job => {
        cronJobNames[job.id] = job.name || 'Unnamed Job';
      });
    }
    
    const sessions = (sessionData.sessions || []).map(s => {
      const isSubagent = s.key.includes('subagent');
      const isCron = s.key.includes('cron:');
      const isGroup = s.kind === 'group';
      
      // Use the formatSessionName function for consistent naming
      let name = formatSessionName(s.key);
      
      // Override with cron job name if available
      if (isCron) {
        const cronMatch = s.key.match(/cron:([a-f0-9-]+)/);
        if (cronMatch && cronJobNames[cronMatch[1]]) {
          name = cronJobNames[cronMatch[1]];
        }
      }
      
      const runtimeMs = s.ageMs || 0;
      let runtime = '-';
      if (runtimeMs > 86400000) runtime = `${Math.floor(runtimeMs / 86400000)}d`;
      else if (runtimeMs > 3600000) runtime = `${Math.floor(runtimeMs / 3600000)}h`;
      else if (runtimeMs > 60000) runtime = `${Math.floor(runtimeMs / 60000)}m`;
      else runtime = `${Math.floor(runtimeMs / 1000)}s`;
      
      return {
        key: s.key,
        name,
        model: s.model || 'unknown',
        runtime,
        runtimeMs,
        status: s.abortedLastRun ? 'aborted' : 'active',
        kind: s.kind,
        isSubagent,
        isCron,
        tokens: s.totalTokens || 0,
        updatedAt: s.updatedAt
      };
    });
    
    sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    const result = { sessions };
    setCache('sessions', result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sessions/:key/kill', requireAuth, async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.key);
    const scriptPath = path.join(__dirname, 'scripts', 'delete-session.sh');
    
    const result = await new Promise((resolve, reject) => {
      exec(`"${scriptPath}" "${key}"`, { timeout: 10000 }, (error, stdout, stderr) => {
        if (error) {
          try {
            const errJson = JSON.parse(stderr || stdout);
            reject(new Error(errJson.error || 'Unknown error'));
          } catch {
            reject(new Error(stderr || error.message));
          }
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch {
          resolve({ raw: stdout });
        }
      });
    });
    
    // Invalidate sessions cache after deletion
    delete cache.data['sessions'];
    delete cache.ts['sessions'];
    
    res.json({ success: true, deleted: key });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Auto-cleanup old completed sub-agents
async function runAutoCleanup() {
  const scriptPath = path.join(__dirname, 'scripts', 'cleanup-sessions.sh');
  return new Promise((resolve) => {
    exec(scriptPath, { timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('Auto-cleanup error:', stderr || error.message);
        resolve({ error: stderr || error.message, deleted: [] });
        return;
      }
      try {
        const result = JSON.parse(stdout);
        if (result.count > 0) {
          console.log(`Auto-cleanup: removed ${result.count} old sub-agent sessions`);
          // Invalidate sessions cache
          delete cache.data['sessions'];
          delete cache.ts['sessions'];
        }
        resolve(result);
      } catch {
        resolve({ raw: stdout });
      }
    });
  });
}

// Run cleanup every 5 minutes
setInterval(runAutoCleanup, 5 * 60 * 1000);

// Manual cleanup endpoint
app.post('/api/sessions/cleanup', requireAuth, async (req, res) => {
  try {
    const result = await runAutoCleanup();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ QUICK ACTION API ============

// Gateway restart
app.post('/api/gateway/restart', requireAuth, async (req, res) => {
  try {
    const result = await new Promise((resolve, reject) => {
      exec('openclaw gateway restart', { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }
        resolve({ stdout, stderr });
      });
    });

    // Clear status cache after restart
    delete cache.data['status'];
    delete cache.ts['status'];

    res.json({ success: true, message: 'Gateway restart initiated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Gateway update
app.post('/api/gateway/update', requireAuth, async (req, res) => {
  try {
    const result = await new Promise((resolve, reject) => {
      exec('openclaw update', { timeout: 120000 }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }
        resolve({ stdout, stderr });
      });
    });

    // Clear status cache after update
    delete cache.data['status'];
    delete cache.ts['status'];

    res.json({ success: true, message: 'Update initiated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check if update available
app.get('/api/gateway/update-available', requireAuth, async (req, res) => {
  try {
    const cached = getCached('update-available');
    if (cached) return res.json(cached);

    // Try to check for updates using openclaw
    const result = await new Promise((resolve, reject) => {
      exec('openclaw update --check 2>&1 || echo "check failed"', { timeout: 30000 }, (error, stdout, stderr) => {
        resolve({ stdout: stdout + stderr, error });
      });
    });

    // Parse output to determine if update is available
    const output = result.stdout.toLowerCase();
    const updateAvailable = output.includes('update available') || output.includes('new version') || output.includes('upgrade');

    const data = {
      available: updateAvailable,
      currentVersion: 'unknown'
    };
    setCache('update-available', data);
    res.json(data);
  } catch (err) {
    res.json({ available: false, currentVersion: 'unknown' });
  }
});

// Clear cache
app.post('/api/cache/clear', requireAuth, async (req, res) => {
  try {
    // Clear all caches
    Object.keys(cache.data).forEach(key => {
      delete cache.data[key];
    });
    Object.keys(cache.ts).forEach(key => {
      delete cache.ts[key];
    });

    res.json({ success: true, message: 'Cache cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trigger backup
app.post('/api/backup', requireAuth, async (req, res) => {
  try {
    const backupScript = config.backupCommand || '/root/.openclaw/workspace/backup-to-atombox.sh';
    const result = await new Promise((resolve, reject) => {
      exec(`"${backupScript}"`, { timeout: 120000 }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }
        resolve({ stdout, stderr });
      });
    });

    res.json({ success: true, message: 'Backup completed', output: result.stdout });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ HIVE API ============
const HIVE_STAGES = ['plan', 'implement', 'verify', 'test', 'deploy', 'done'];

function getNextStage(stage) {
  const idx = HIVE_STAGES.indexOf(stage);
  if (idx === -1) return null;
  return HIVE_STAGES[idx + 1] || null;
}

const PIPELINE_STAGE_SEQUENCE = ['implement', 'verify', 'test', 'deploy', 'done'];

function getNextPipelineStage(stage) {
  const idx = PIPELINE_STAGE_SEQUENCE.indexOf(stage);
  if (idx === -1) return null;
  return PIPELINE_STAGE_SEQUENCE[idx + 1] || null;
}

function spawnAgent(taskPrompt, taskId, stage) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      message: taskPrompt,
      model: 'openai-codex/gpt-5.2-codex'
    });

    const options = {
      hostname: '127.0.0.1',
      port: 4444,
      path: '/api/sessions/spawn',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.OPENCLAW_TOKEN,
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ raw: data });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function logStep(runId, level, message) {
  hiveDb.prepare(`
    INSERT INTO step_logs (run_id, level, message)
    VALUES (?, ?, ?)
  `).run(runId, level, message);
}

function buildAgentPrompt(task, project, stage, previousOutput, errorContext) {
  const baseUrl = 'http://127.0.0.1:3000';
  const advanceUrl = `${baseUrl}/api/hive/pipeline/${task.id}/advance`;
  const failUrl = `${baseUrl}/api/hive/pipeline/${task.id}/fail`;

  const callbackInstructions = `
CRITICAL: When you are completely done, you MUST call one of these endpoints:
- On SUCCESS: POST to ${advanceUrl} with body {"output": "Brief summary of what you did"}
- On FAILURE: POST to ${failUrl} with body {"error": "What went wrong"}
Use curl or fetch to make the HTTP call. This is mandatory — the pipeline depends on it.
`;

  const templates = {
    implement: `You are a coding agent implementing a feature. Do NOT spawn sub-agents.

PROJECT: ${project.repo_path}
TASK: ${task.title}

SPEC:
${task.spec}

INSTRUCTIONS:
1. Create a git worktree branch: task-${task.id}-implement
2. Implement all changes described in the spec
3. Commit your changes
4. ${callbackInstructions}`,

    verify: `You are a code verification agent. Do NOT spawn sub-agents.

PROJECT: ${project.repo_path}
TASK: ${task.title}

SPEC:
${task.spec}

PREVIOUS STEP OUTPUT:
${previousOutput || 'N/A'}

INSTRUCTIONS:
1. Review the code changes on branch task-${task.id}-implement
2. Check: Does the code match the spec? Are there bugs? Missing error handling? ID mismatches?
3. If issues found: fix them and commit
4. ${callbackInstructions}`,

    test: `You are a testing agent. Do NOT spawn sub-agents.

PROJECT: ${project.repo_path}
TASK: ${task.title}

SPEC:
${task.spec}

PREVIOUS STEP OUTPUT:
${previousOutput || 'N/A'}

INSTRUCTIONS:
1. Review the implemented code on branch task-${task.id}-implement
2. Test the changes: start the server if needed, hit API endpoints, verify responses
3. Check for regressions in existing functionality
4. ${callbackInstructions}`,

    deploy: `You are a deployment agent. Do NOT spawn sub-agents.

PROJECT: ${project.repo_path}
TASK: ${task.title}

INSTRUCTIONS:
1. Merge branch task-${task.id}-implement into main
2. Run any database migrations if needed
3. Restart the PM2 process for this project
4. Verify the app starts successfully
5. Clean up the worktree branch
6. ${callbackInstructions}`
  };

  let prompt = templates[stage];
  if (errorContext) {
    prompt += `\n\nPREVIOUS ERROR:\n${errorContext}`;
  }

  return prompt;
}

async function startPipelineStep(taskId, stage, options = {}) {
  const task = hiveDb.prepare(`
    SELECT t.*, p.repo_path
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    WHERE t.id = ?
  `).get(taskId);

  if (!task) {
    throw new Error('task not found');
  }

  const previousRun = hiveDb.prepare(`
    SELECT * FROM pipeline_runs
    WHERE task_id = ?
    ORDER BY id DESC LIMIT 1
  `).get(taskId);

  const runInsert = hiveDb.prepare(`
    INSERT INTO pipeline_runs (task_id, stage, status)
    VALUES (?, ?, 'running')
  `).run(taskId, stage);

  const runId = runInsert.lastInsertRowid;
  logStep(runId, 'info', `Step started: ${stage}`);

  hiveDb.prepare(`
    UPDATE tasks
    SET status = 'running',
        stage = ?,
        started_at = COALESCE(started_at, datetime('now')),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(stage, taskId);

  const taskPrompt = buildAgentPrompt(task, { repo_path: task.repo_path }, stage, previousRun?.output, options.errorContext);

  let spawnResult = null;
  try {
    spawnResult = await spawnAgent(taskPrompt, taskId, stage);
    const sessionKey = spawnResult?.sessionKey || spawnResult?.key || spawnResult?.session?.key || null;
    if (sessionKey) {
      hiveDb.prepare(`
        UPDATE pipeline_runs
        SET agent_session_key = ?
        WHERE id = ?
      `).run(sessionKey, runId);
    }
    logStep(runId, 'info', `Agent spawned for ${stage}`);
  } catch (err) {
    logStep(runId, 'error', `Agent spawn failed: ${err.message}`);
    throw err;
  }

  return { runId, spawnResult };
}

app.get('/api/hive/projects', requireAuth, (req, res) => {
  try {
    const projects = hiveDb.prepare('SELECT * FROM projects ORDER BY id ASC').all();
    res.json({ projects });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/hive/projects', requireAuth, (req, res) => {
  try {
    const { name, description, repo_path } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });

    const stmt = hiveDb.prepare('INSERT INTO projects (name, description, repo_path) VALUES (?, ?, ?)');
    const result = stmt.run(name, description || null, repo_path || null);
    const project = hiveDb.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
    res.json({ project });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/hive/projects/:id', requireAuth, (req, res) => {
  try {
    const { name, description, repo_path } = req.body || {};
    const existing = hiveDb.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'project not found' });

    hiveDb.prepare(`
      UPDATE projects
      SET name = COALESCE(?, name),
          description = COALESCE(?, description),
          repo_path = COALESCE(?, repo_path),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(name, description, repo_path, req.params.id);

    const project = hiveDb.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    res.json({ project });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/hive/projects/:id', requireAuth, (req, res) => {
  try {
    const existing = hiveDb.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'project not found' });

    const taskCount = hiveDb.prepare('SELECT COUNT(1) as count FROM tasks WHERE project_id = ?').get(req.params.id);
    if (taskCount.count > 0) {
      return res.status(400).json({ error: 'project has tasks' });
    }

    hiveDb.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/hive/tasks', requireAuth, (req, res) => {
  try {
    const filters = [];
    const params = [];
    if (req.query.project_id) {
      filters.push('project_id = ?');
      params.push(req.query.project_id);
    }
    if (req.query.status) {
      filters.push('status = ?');
      params.push(req.query.status);
    }
    if (req.query.stage) {
      filters.push('stage = ?');
      params.push(req.query.stage);
    }
    if (req.query.parent_id !== undefined) {
      if (req.query.parent_id === 'null') {
        filters.push('parent_id IS NULL');
      } else {
        filters.push('parent_id = ?');
        params.push(req.query.parent_id);
      }
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const tasks = hiveDb.prepare(`SELECT * FROM tasks ${where} ORDER BY created_at DESC`).all(...params);
    res.json({ tasks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/hive/tasks/:id', requireAuth, (req, res) => {
  try {
    const task = hiveDb.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'task not found' });

    const runs = hiveDb.prepare('SELECT * FROM pipeline_runs WHERE task_id = ? ORDER BY id ASC').all(req.params.id);
    let stepLogs = [];
    if (runs.length > 0) {
      const runIds = runs.map(r => r.id);
      const placeholders = runIds.map(() => '?').join(',');
      stepLogs = hiveDb.prepare(`SELECT * FROM step_logs WHERE run_id IN (${placeholders}) ORDER BY id ASC`).all(...runIds);
    }

    const subtasks = hiveDb.prepare('SELECT * FROM tasks WHERE parent_id = ? ORDER BY created_at ASC').all(req.params.id);
    const feedbackTasks = hiveDb.prepare('SELECT * FROM tasks WHERE linked_from_id = ? ORDER BY created_at ASC').all(req.params.id);

    res.json({ ...task, subtasks, feedback_tasks: feedbackTasks, pipeline_runs: runs, step_logs: stepLogs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/hive/tasks', requireAuth, (req, res) => {
  try {
    const { project_id, title, spec, priority, parent_id, linked_from_id } = req.body || {};
    if (!project_id || !title) {
      return res.status(400).json({ error: 'project_id and title are required' });
    }

    const stmt = hiveDb.prepare(`
      INSERT INTO tasks (project_id, title, spec, priority, parent_id, linked_from_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      project_id,
      title,
      spec || null,
      priority || 'normal',
      parent_id || null,
      linked_from_id || null
    );
    const task = hiveDb.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
    res.json({ task });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/hive/tasks/:id', requireAuth, (req, res) => {
  try {
    const { title, spec, priority } = req.body || {};
    const existing = hiveDb.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'task not found' });

    hiveDb.prepare(`
      UPDATE tasks
      SET title = COALESCE(?, title),
          spec = COALESCE(?, spec),
          priority = COALESCE(?, priority),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(title, spec, priority, req.params.id);

    const task = hiveDb.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    res.json({ task });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/hive/tasks/:id', requireAuth, (req, res) => {
  try {
    const existing = hiveDb.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'task not found' });

    const runIds = hiveDb.prepare('SELECT id FROM pipeline_runs WHERE task_id = ?').all(req.params.id).map(r => r.id);
    if (runIds.length > 0) {
      const placeholders = runIds.map(() => '?').join(',');
      hiveDb.prepare(`DELETE FROM step_logs WHERE run_id IN (${placeholders})`).run(...runIds);
    }
    hiveDb.prepare('DELETE FROM pipeline_runs WHERE task_id = ?').run(req.params.id);
    hiveDb.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/hive/tasks/:id/greenlight', requireAuth, async (req, res) => {
  try {
    const task = hiveDb.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'task not found' });

    const newGreenlit = task.greenlit ? 0 : 1;
    let nextStatus = task.status;
    let nextStage = task.stage;
    let startedAt = task.started_at;

    if (newGreenlit) {
      if (task.auto_run) {
        nextStatus = 'running';
        nextStage = 'implement';
        if (!startedAt) startedAt = new Date().toISOString();
      } else {
        nextStatus = 'greenlit';
      }
    } else {
      if (task.status === 'greenlit') nextStatus = 'plan';
    }

    hiveDb.prepare(`
      UPDATE tasks
      SET greenlit = ?,
          status = ?,
          stage = ?,
          started_at = COALESCE(?, started_at),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(newGreenlit, nextStatus, nextStage, startedAt, task.id);

    if (newGreenlit && task.auto_run) {
      await startPipelineStep(task.id, 'implement');
    }

    const updated = hiveDb.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
    res.json({ task: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/hive/tasks/:id/pause', requireAuth, (req, res) => {
  try {
    const task = hiveDb.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'task not found' });

    hiveDb.prepare(`
      UPDATE tasks
      SET status = 'paused', updated_at = datetime('now')
      WHERE id = ?
    `).run(req.params.id);

    const updated = hiveDb.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    res.json({ task: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/hive/tasks/:id/archive', requireAuth, (req, res) => {
  try {
    const task = hiveDb.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'task not found' });

    hiveDb.prepare(`
      UPDATE tasks
      SET status = 'archived', updated_at = datetime('now')
      WHERE id = ?
    `).run(req.params.id);

    hiveDb.prepare(`
      UPDATE tasks
      SET status = 'archived', updated_at = datetime('now')
      WHERE parent_id = ?
    `).run(req.params.id);

    const updated = hiveDb.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    res.json({ task: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/hive/tasks/:id/retry', requireAuth, (req, res) => {
  try {
    const task = hiveDb.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'task not found' });

    hiveDb.prepare(`
      UPDATE tasks
      SET status = 'greenlit',
          greenlit = 1,
          retry_count = retry_count + 1,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(req.params.id);

    const updated = hiveDb.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    res.json({ task: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/hive/tasks/:id/feedback', requireAuth, (req, res) => {
  try {
    const { feedback_text } = req.body || {};
    if (!feedback_text) return res.status(400).json({ error: 'feedback_text is required' });

    const task = hiveDb.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'task not found' });

    const createFeedback = hiveDb.transaction(() => {
      const insert = hiveDb.prepare(`
        INSERT INTO tasks (
          project_id,
          title,
          spec,
          status,
          stage,
          linked_from_id,
          parent_id,
          feedback_text
        )
        VALUES (?, ?, ?, 'plan', 'plan', ?, NULL, ?)
      `);

      const result = insert.run(
        task.project_id,
        `${task.title} (feedback)`,
        feedback_text,
        task.id,
        feedback_text
      );

      hiveDb.prepare(`
        UPDATE tasks
        SET status = 'archived', updated_at = datetime('now')
        WHERE id = ?
      `).run(task.id);

      return result.lastInsertRowid;
    });

    const newTaskId = createFeedback();
    const newTask = hiveDb.prepare('SELECT * FROM tasks WHERE id = ?').get(newTaskId);
    res.json({ task: newTask });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/hive/pipeline/:taskId/advance', requireAuth, async (req, res) => {
  try {
    const { output } = req.body || {};
    const task = hiveDb.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.taskId);
    if (!task) return res.status(404).json({ error: 'task not found' });

    const currentStage = task.stage;
    const currentRun = hiveDb.prepare(`
      SELECT * FROM pipeline_runs
      WHERE task_id = ? AND stage = ?
      ORDER BY id DESC LIMIT 1
    `).get(task.id, currentStage);

    if (!currentRun) return res.status(404).json({ error: 'current pipeline run not found' });

    hiveDb.prepare(`
      UPDATE pipeline_runs
      SET status = 'passed',
          completed_at = datetime('now'),
          duration_ms = CAST((julianday('now') - julianday(started_at)) * 86400000 AS INTEGER),
          output = COALESCE(?, output)
      WHERE id = ?
    `).run(output || null, currentRun.id);

    logStep(currentRun.id, 'success', `Step completed: ${currentStage}`);

    const nextStage = getNextPipelineStage(currentStage);

    if (!nextStage || nextStage === 'done') {
      hiveDb.prepare(`
        UPDATE tasks
        SET status = 'done',
            stage = 'done',
            completed_at = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?
      `).run(task.id);

      const updated = hiveDb.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
      return res.json({ task: updated, done: true });
    }

    await startPipelineStep(task.id, nextStage);

    const updated = hiveDb.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
    res.json({ task: updated, next_stage: nextStage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/hive/pipeline/:taskId/fail', requireAuth, async (req, res) => {
  try {
    const { error } = req.body || {};
    const task = hiveDb.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.taskId);
    if (!task) return res.status(404).json({ error: 'task not found' });

    const currentStage = task.stage;
    const currentRun = hiveDb.prepare(`
      SELECT * FROM pipeline_runs
      WHERE task_id = ? AND stage = ?
      ORDER BY id DESC LIMIT 1
    `).get(task.id, currentStage);

    if (!currentRun) return res.status(404).json({ error: 'current pipeline run not found' });

    hiveDb.prepare(`
      UPDATE pipeline_runs
      SET status = 'failed',
          completed_at = datetime('now'),
          duration_ms = CAST((julianday('now') - julianday(started_at)) * 86400000 AS INTEGER),
          error = COALESCE(?, error)
      WHERE id = ?
    `).run(error || null, currentRun.id);

    logStep(currentRun.id, 'error', `Step failed: ${currentStage} - ${error || 'unknown error'}`);

    if (task.retry_count < task.max_retries) {
      hiveDb.prepare(`
        UPDATE tasks
        SET retry_count = retry_count + 1,
            status = 'running',
            updated_at = datetime('now')
        WHERE id = ?
      `).run(task.id);

      logStep(currentRun.id, 'warn', `Retrying step ${currentStage} (${task.retry_count + 1}/${task.max_retries})`);

      await startPipelineStep(task.id, currentStage, { errorContext: error || 'Unknown error' });

      const updated = hiveDb.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
      return res.json({ task: updated, retrying: true });
    }

    hiveDb.prepare(`
      UPDATE tasks
      SET status = 'failed',
          updated_at = datetime('now')
      WHERE id = ?
    `).run(task.id);

    const updated = hiveDb.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
    res.json({ task: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/hive/dashboard', requireAuth, (req, res) => {
  try {
    const projects = hiveDb.prepare('SELECT id, name FROM projects ORDER BY name ASC').all();
    const tasks = hiveDb.prepare(`
      SELECT
        t.id,
        t.title,
        t.project_id,
        p.name AS project_name,
        t.status,
        t.stage,
        t.priority,
        t.greenlit,
        t.created_at,
        t.started_at,
        t.completed_at,
        pr.id AS run_id,
        pr.stage AS run_stage,
        pr.status AS run_status,
        pr.started_at AS run_started_at,
        pr.completed_at AS run_completed_at,
        pr.duration_ms AS run_duration_ms,
        pr.error AS run_error,
        pr.output AS run_output
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      LEFT JOIN pipeline_runs pr ON pr.id = (
        SELECT id FROM pipeline_runs WHERE task_id = t.id ORDER BY id DESC LIMIT 1
      )
      WHERE t.status IS NULL OR t.status != 'archived'
      ORDER BY t.created_at DESC
    `).all();

    const archivedRows = hiveDb.prepare(`
      SELECT
        t.id,
        t.title,
        t.project_id,
        p.name AS project_name,
        t.status,
        t.stage,
        t.priority,
        t.greenlit,
        t.created_at,
        t.started_at,
        t.completed_at,
        pr.id AS run_id,
        pr.stage AS run_stage,
        pr.status AS run_status,
        pr.started_at AS run_started_at,
        pr.completed_at AS run_completed_at,
        pr.duration_ms AS run_duration_ms,
        pr.error AS run_error,
        pr.output AS run_output
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      LEFT JOIN pipeline_runs pr ON pr.id = (
        SELECT id FROM pipeline_runs WHERE task_id = t.id ORDER BY id DESC LIMIT 1
      )
      WHERE t.status = 'archived'
      ORDER BY t.created_at DESC
      LIMIT 50
    `).all();

    const archivedCount = hiveDb.prepare(`
      SELECT COUNT(1) AS count
      FROM tasks
      WHERE status = 'archived'
    `).get();

    const stages = {
      plan: [],
      implement: [],
      verify: [],
      test: [],
      deploy: [],
      done: []
    };

    const formatTaskRow = (task) => {
      const latestRun = task.run_id ? {
        id: task.run_id,
        stage: task.run_stage,
        status: task.run_status,
        started_at: task.run_started_at,
        completed_at: task.run_completed_at,
        duration_ms: task.run_duration_ms,
        error: task.run_error,
        output: task.run_output
      } : null;

      return {
        id: task.id,
        title: task.title,
        project_id: task.project_id,
        project_name: task.project_name,
        status: task.status,
        stage: task.stage,
        priority: task.priority,
        greenlit: task.greenlit,
        created_at: task.created_at,
        started_at: task.started_at,
        completed_at: task.completed_at,
        latest_run: latestRun
      };
    };

    tasks.forEach(task => {
      const formatted = formatTaskRow(task);
      if (!stages[task.stage]) stages[task.stage] = [];
      stages[task.stage].push(formatted);
    });

    const archived = archivedRows.map(formatTaskRow);
    const counts = Object.fromEntries(Object.keys(stages).map(stage => [stage, stages[stage].length]));

    res.json({ stages, counts, projects, archived, archivedCount: archivedCount.count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ TASKS API ============

// Data file for tasks
const TASKS_FILE = path.join(__dirname, '..', 'tasks.json');

// Helper functions for tasks
function loadTasksData() {
  try {
    if (!fs.existsSync(TASKS_FILE)) {
      // Initialize with default projects
      const initialData = {
        projects: {
          general: {
            name: "General",
            icon: "📋",
            color: "#6B7280",
            tasks: []
          },
          atomtrader: {
            name: "AtomTrader",
            icon: "📈",
            color: "#10B981",
            tasks: []
          },
          primortal: {
            name: "Primortal",
            icon: "⚔️",
            color: "#8B5CF6",
            tasks: []
          }
        }
      };
      fs.writeFileSync(TASKS_FILE, JSON.stringify(initialData, null, 2), 'utf8');
      return initialData;
    }
    const data = fs.readFileSync(TASKS_FILE, 'utf8');
    const parsed = JSON.parse(data);
    
    // Handle legacy format migration
    if (parsed.tasks && !parsed.projects) {
      const migrated = {
        projects: {
          general: {
            name: "General",
            icon: "📋",
            color: "#6B7280",
            tasks: parsed.tasks || []
          }
        }
      };
      saveTasksData(migrated);
      return migrated;
    }
    
    return parsed;
  } catch (err) {
    console.error('Error loading tasks:', err);
    return { projects: {} };
  }
}

function saveTasksData(data) {
  try {
    fs.writeFileSync(TASKS_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving tasks:', err);
    return false;
  }
}

// Helper to flatten all tasks across projects (for legacy compatibility)
function getAllProjectsFlat() {
  const data = loadTasksData();
  const allTasks = [];
  for (const [projectId, project] of Object.entries(data.projects)) {
    allTasks.push(...(project.tasks || []));
  }
  return allTasks;
}

// ============ PROJECTS API ============

// Get all projects with tasks
app.get('/api/tasks', requireAuth, async (req, res) => {
  try {
    const data = loadTasksData();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get tasks for a specific project
app.get('/api/tasks/:projectId', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const data = loadTasksData();
    
    if (!data.projects[projectId]) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json({ tasks: data.projects[projectId].tasks || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new task in a project
app.post('/api/tasks/:projectId', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { title, description, priority = 'medium', assignee = 'atom' } = req.body;
    
    if (!title || title.trim() === '') {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    const data = loadTasksData();
    
    if (!data.projects[projectId]) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const now = Date.now();
    const projectTasks = data.projects[projectId].tasks || [];
    
    // Find max order for todo column in this project
    const todoTasks = projectTasks.filter(t => t.status === 'todo');
    const maxOrder = todoTasks.length > 0 
      ? Math.max(...todoTasks.map(t => t.order)) 
      : -1;
    
    const validAssignees = config.taskAssignees || ['agent', 'user'];
    const newTask = {
      id: crypto.randomUUID(),
      title: title.trim(),
      description: description ? description.trim() : '',
      status: 'todo',
      priority: ['high', 'medium', 'low'].includes(priority) ? priority : 'medium',
      assignee: validAssignees.includes(assignee) ? assignee : validAssignees[0],
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now
    };
    
    data.projects[projectId].tasks.push(newTask);
    saveTasksData(data);
    
    res.json({ success: true, task: newTask });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update task in a project
app.put('/api/tasks/:projectId/:taskId', requireAuth, async (req, res) => {
  try {
    const { projectId, taskId } = req.params;
    const updates = req.body;
    
    const data = loadTasksData();
    
    if (!data.projects[projectId]) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const tasks = data.projects[projectId].tasks || [];
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    
    if (taskIndex === -1) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Update allowed fields
    const allowedFields = ['title', 'description', 'status', 'priority', 'assignee'];
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        tasks[taskIndex][field] = updates[field];
      }
    }
    
    tasks[taskIndex].updatedAt = Date.now();
    saveTasksData(data);
    
    res.json({ success: true, task: tasks[taskIndex] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete task from a project
app.delete('/api/tasks/:projectId/:taskId', requireAuth, async (req, res) => {
  try {
    const { projectId, taskId } = req.params;
    
    const data = loadTasksData();
    
    if (!data.projects[projectId]) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const tasks = data.projects[projectId].tasks || [];
    const initialLength = tasks.length;
    const filteredTasks = tasks.filter(t => t.id !== taskId);
    
    if (filteredTasks.length === initialLength) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    data.projects[projectId].tasks = filteredTasks;
    saveTasksData(data);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk reorder tasks in a project
app.put('/api/tasks/:projectId/reorder', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { tasks: taskUpdates } = req.body;
    
    if (!Array.isArray(taskUpdates)) {
      return res.status(400).json({ error: 'tasks must be an array' });
    }
    
    const data = loadTasksData();
    
    if (!data.projects[projectId]) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const tasks = data.projects[projectId].tasks || [];
    const now = Date.now();
    
    // Update each task's status and order
    for (const update of taskUpdates) {
      const taskIndex = tasks.findIndex(t => t.id === update.id);
      if (taskIndex !== -1) {
        tasks[taskIndex].status = update.status;
        tasks[taskIndex].order = update.order;
        tasks[taskIndex].updatedAt = now;
      }
    }
    
    saveTasksData(data);
    res.json({ success: true, tasks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new project
app.post('/api/projects', requireAuth, async (req, res) => {
  try {
    const { name, icon, color, projectId } = req.body;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    const data = loadTasksData();
    
    // Generate project ID if not provided
    const id = projectId || name.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    if (data.projects[id]) {
      return res.status(400).json({ error: 'Project ID already exists' });
    }
    
    const newProject = {
      name: name.trim(),
      icon: icon || '📁',
      color: color || '#6B7280',
      tasks: []
    };
    
    data.projects[id] = newProject;
    saveTasksData(data);
    
    res.json({ success: true, projectId: id, project: newProject });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update project details
app.put('/api/projects/:projectId', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { name, icon, color } = req.body;
    
    const data = loadTasksData();
    
    if (!data.projects[projectId]) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const project = data.projects[projectId];
    
    if (name !== undefined) project.name = name.trim();
    if (icon !== undefined) project.icon = icon;
    if (color !== undefined) project.color = color;
    
    saveTasksData(data);
    
    res.json({ success: true, projectId, project });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete project
app.delete('/api/projects/:projectId', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    
    const data = loadTasksData();
    
    if (!data.projects[projectId]) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Don't allow deleting the last project
    const projectCount = Object.keys(data.projects).length;
    if (projectCount <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last project' });
    }
    
    delete data.projects[projectId];
    saveTasksData(data);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Legacy API endpoints (for backward compatibility during transition)

// Get all tasks (legacy - flattened)
app.get('/api/tasks/all', requireAuth, async (req, res) => {
  try {
    const tasks = getAllProjectsFlat();
    res.json({ tasks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ SYSTEM STATS COLLECTOR ============

// In-memory storage for system stats history (60 samples = 30 min at 30s intervals)
const systemStatsHistory = {
  timestamps: [],
  cpu: [],
  ram: [],
  maxSamples: 60
};

let lastCpuStats = null;

// Parse /proc/stat to get CPU usage
function getCpuStats() {
  return new Promise((resolve, reject) => {
    fs.readFile('/proc/stat', 'utf8', (err, data) => {
      if (err) return reject(err);
      
      const cpuLine = data.split('\n')[0];
      const values = cpuLine.split(/\s+/).slice(1).map(Number);
      
      // user, nice, system, idle, iowait, irq, softirq, steal
      const idle = values[3];
      const total = values.reduce((a, b) => a + b, 0);
      
      resolve({ idle, total });
    });
  });
}

// Calculate CPU percentage from delta
async function getCurrentCpuPercent() {
  try {
    const current = await getCpuStats();
    
    if (!lastCpuStats) {
      lastCpuStats = current;
      return 0;
    }
    
    const totalDelta = current.total - lastCpuStats.total;
    const idleDelta = current.idle - lastCpuStats.idle;
    
    lastCpuStats = current;
    
    if (totalDelta === 0) return 0;
    
    const percent = ((totalDelta - idleDelta) / totalDelta) * 100;
    return Math.max(0, Math.min(100, percent));
  } catch (err) {
    console.error('CPU stats error:', err);
    return 0;
  }
}

// Parse /proc/meminfo to get RAM usage
function getRamStats() {
  return new Promise((resolve, reject) => {
    fs.readFile('/proc/meminfo', 'utf8', (err, data) => {
      if (err) return reject(err);
      
      const lines = data.split('\n');
      const memTotal = parseInt(lines.find(l => l.startsWith('MemTotal:')).split(/\s+/)[1]);
      const memAvailable = parseInt(lines.find(l => l.startsWith('MemAvailable:')).split(/\s+/)[1]);
      
      const totalGB = memTotal / 1024 / 1024;
      const usedGB = (memTotal - memAvailable) / 1024 / 1024;
      const percent = (usedGB / totalGB) * 100;
      
      resolve({ percent, usedGB, totalGB });
    });
  });
}

// Get disk usage using df
function getDiskStats() {
  return new Promise((resolve, reject) => {
    exec('df -h / | tail -1', (error, stdout) => {
      if (error) return reject(error);
      
      const parts = stdout.split(/\s+/);
      const percent = parseInt(parts[4]);
      const mount = parts[5];
      
      resolve({ percent, mount });
    });
  });
}

// Get system uptime
function getUptime() {
  return new Promise((resolve, reject) => {
    fs.readFile('/proc/uptime', 'utf8', (err, data) => {
      if (err) return reject(err);
      
      const seconds = parseInt(data.split(' ')[0]);
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      
      let formatted = '';
      if (days > 0) formatted += `${days}d `;
      if (hours > 0) formatted += `${hours}h `;
      formatted += `${minutes}m`;
      
      resolve({ seconds, formatted: formatted.trim() });
    });
  });
}

// Get CPU core count
function getCpuCores() {
  return new Promise((resolve, reject) => {
    fs.readFile('/proc/cpuinfo', 'utf8', (err, data) => {
      if (err) return reject(err);
      
      const processors = data.match(/^processor/gm);
      resolve(processors ? processors.length : 1);
    });
  });
}

// Collect system stats sample
async function collectSystemStatsSample() {
  try {
    const [cpuPercent, ramStats] = await Promise.all([
      getCurrentCpuPercent(),
      getRamStats()
    ]);
    
    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    // Add to history
    systemStatsHistory.timestamps.push(timestamp);
    systemStatsHistory.cpu.push(Math.round(cpuPercent * 10) / 10);
    systemStatsHistory.ram.push(Math.round(ramStats.percent * 10) / 10);
    
    // Keep only last N samples
    if (systemStatsHistory.timestamps.length > systemStatsHistory.maxSamples) {
      systemStatsHistory.timestamps.shift();
      systemStatsHistory.cpu.shift();
      systemStatsHistory.ram.shift();
    }
  } catch (err) {
    console.error('Stats collection error:', err);
  }
}

// Start collecting stats every 30 seconds
setInterval(collectSystemStatsSample, 30000);
collectSystemStatsSample(); // Initial sample

// ============ NEW API ENDPOINTS ============

// GET /api/system-stats - Real-time system stats
app.get('/api/system-stats', requireAuth, async (req, res) => {
  try {
    const [cpuPercent, ramStats, diskStats, uptime, cores] = await Promise.all([
      getCurrentCpuPercent(),
      getRamStats(),
      getDiskStats(),
      getUptime(),
      getCpuCores()
    ]);
    
    res.json({
      cpu: {
        percent: Math.round(cpuPercent * 10) / 10,
        cores
      },
      ram: {
        percent: Math.round(ramStats.percent * 10) / 10,
        usedGB: Math.round(ramStats.usedGB * 10) / 10,
        totalGB: Math.round(ramStats.totalGB * 10) / 10
      },
      disk: {
        percent: diskStats.percent,
        mount: diskStats.mount
      },
      uptime: {
        seconds: uptime.seconds,
        formatted: uptime.formatted
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/system-stats/history - Historical CPU/RAM data
app.get('/api/system-stats/history', requireAuth, async (req, res) => {
  try {
    res.json(systemStatsHistory);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ USAGE API - Parse session .jsonl files ============

const SESSIONS_DIR = '/root/.openclaw/agents/main/sessions';
let usageCache = null;
let usageCacheTime = 0;
const USAGE_CACHE_TTL = 60000; // 1 minute cache

async function parseUsageData() {
  // Return cache if fresh
  if (usageCache && Date.now() - usageCacheTime < USAGE_CACHE_TTL) {
    return usageCache;
  }
  
  const daily = {}; // date -> { total, byModel: {}, inputTokens, outputTokens }
  const modelBreakdown = {};
  const sessionCosts = {}; // sessionKey -> { cost, model, tokens }
  
  // Build sessionId -> key reverse map for human-readable names
  let sessionIdToKey = {};
  try {
    const sessionsJson = JSON.parse(await fs.promises.readFile(path.join(SESSIONS_DIR, 'sessions.json'), 'utf8'));
    for (const [key, val] of Object.entries(sessionsJson)) {
      if (val.sessionId) sessionIdToKey[val.sessionId] = key;
    }
  } catch { /* ignore */ }
  
  try {
    // Get list of .jsonl files
    const files = await fs.promises.readdir(SESSIONS_DIR);
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
    
    // Build labels for orphaned sessions by reading first user message
    async function getSessionLabel(filePath, sessionId) {
      try {
        const content = await fs.promises.readFile(filePath, 'utf8');
        const lines = content.split('\n').filter(l => l.trim());
        for (const line of lines.slice(0, 20)) {
          try {
            const entry = JSON.parse(line);
            if (entry.type === 'message' && entry.message) {
              const content = entry.message.content;
              if (Array.isArray(content)) {
                const text = content.find(c => c.type === 'text');
                if (text && text.text) {
                  const label = text.text.replace(/\[.*?\]/g, '').trim().substring(0, 40);
                  if (label) return `Session: ${label}${label.length >= 40 ? '…' : ''}`;
                }
              } else if (typeof content === 'string') {
                const label = content.substring(0, 40);
                return `Session: ${label}${label.length >= 40 ? '…' : ''}`;
              }
            }
          } catch {}
        }
      } catch {}
      return `Session ${sessionId.substring(0, 8)}…`;
    }
    
    // Process each file
    for (const file of jsonlFiles) {
      const filePath = path.join(SESSIONS_DIR, file);
      const sessionId = file.replace('.jsonl', '');
      let sessionKey = sessionIdToKey[sessionId];
      if (!sessionKey) {
        sessionKey = await getSessionLabel(filePath, sessionId);
      }
      
      try {
        const content = await fs.promises.readFile(filePath, 'utf8');
        const lines = content.split('\n').filter(l => l.trim());
        
        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            
            // Look for usage data in message entries (type: "message")
            // The structure is: entry.message.usage.cost
            let usage = null;
            let model = 'unknown';
            let timestamp = entry.timestamp || Date.now();
            
            if (entry.type === 'message' && entry.message?.usage?.cost) {
              usage = entry.message.usage;
              model = entry.message.model || 'unknown';
            } else if (entry.usage && entry.usage.cost) {
              // Alternative format
              usage = entry.usage;
              model = entry.model || entry.usage.model || 'unknown';
            }
            
            if (usage && usage.cost) {
              const cost = usage.cost;
              const totalCost = cost.total || 0;
              const shortModel = model.split('/').pop();
              
              // Parse timestamp for date
              const date = new Date(timestamp).toISOString().split('T')[0];
              
              // Initialize daily entry
              if (!daily[date]) {
                daily[date] = { total: 0, byModel: {}, inputTokens: 0, outputTokens: 0 };
              }
              
              // Add to daily totals
              daily[date].total += totalCost;
              daily[date].byModel[shortModel] = (daily[date].byModel[shortModel] || 0) + totalCost;
              
              // Add tokens if available (use input/output from usage object)
              if (usage.input) {
                daily[date].inputTokens += usage.input;
              }
              if (usage.output) {
                daily[date].outputTokens += usage.output;
              }
              
              // Model breakdown
              modelBreakdown[shortModel] = (modelBreakdown[shortModel] || 0) + totalCost;
              
              // Session costs
              if (!sessionCosts[sessionKey]) {
                sessionCosts[sessionKey] = { cost: 0, model: shortModel, tokens: 0 };
              }
              sessionCosts[sessionKey].cost += totalCost;
              sessionCosts[sessionKey].tokens += (usage.input || 0) + (usage.output || 0);
            }
          } catch (lineErr) {
            // Skip malformed lines
          }
        }
      } catch (fileErr) {
        // Skip files that can't be read
      }
    }
  } catch (err) {
    console.error('Error parsing usage data:', err);
  }
  
  // Calculate totals
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  
  // Get week start (Sunday)
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  
  // Get month start
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  
  let todayTotal = 0;
  let weekTotal = 0;
  let monthTotal = 0;
  
  for (const [dateStr, data] of Object.entries(daily)) {
    const date = new Date(dateStr);
    
    if (dateStr === todayStr) {
      todayTotal += data.total;
    }
    if (date >= weekStart) {
      weekTotal += data.total;
    }
    if (date >= monthStart) {
      monthTotal += data.total;
    }
  }
  
  // Convert daily object to sorted array
  const dailyArray = Object.entries(daily)
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30); // Last 30 days
  
  // Get top sessions by cost with human-readable names
  const topSessions = Object.entries(sessionCosts)
    .map(([key, data]) => ({ 
      key, 
      displayName: formatSessionName(key),
      ...data 
    }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 10);
  
  const result = {
    totals: {
      today: todayTotal,
      week: weekTotal,
      month: monthTotal
    },
    daily: dailyArray,
    modelBreakdown,
    topSessions
  };
  
  usageCache = result;
  usageCacheTime = Date.now();
  
  return result;
}

// GET /api/usage - Cost/token usage aggregation
app.get('/api/usage', requireAuth, async (req, res) => {
  try {
    const usage = await parseUsageData();
    res.json(usage);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ LOGS STREAMING API ============

// Log file paths to tail
const LOG_FILES = [
  { path: '/root/.pm2/logs/atomtrader-out.log', source: 'atomtrader', level: 'INFO' },
  { path: '/root/.pm2/logs/atomtrader-error.log', source: 'atomtrader', level: 'ERROR' },
  { path: '/root/.pm2/logs/cron-dashboard-out.log', source: 'cron-dashboard', level: 'INFO' },
  { path: '/root/.pm2/logs/cron-dashboard-error.log', source: 'cron-dashboard', level: 'ERROR' }
];

// GET /api/logs/stream - SSE stream of logs
app.get('/api/logs/stream', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  
  // Send initial connection message
  res.write('data: {"type":"connected","message":"Log stream connected"}\n\n');
  
  const tailProcesses = [];
  
  // Start tailing each log file
  for (const logFile of LOG_FILES) {
    if (!fs.existsSync(logFile.path)) continue;
    
    const tail = spawn('tail', ['-F', '-n', '10', logFile.path]);
    tailProcesses.push(tail);
    
    tail.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      
      for (const line of lines) {
        // Parse log line - try to extract timestamp and level
        let level = logFile.level;
        let message = line;
        let timestamp = new Date().toISOString();
        
        // Try to parse PM2 format: "timestamp | message"
        const pm2Match = line.match(/^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[^\|]*)\|(.+)$/);
        if (pm2Match) {
          timestamp = new Date(pm2Match[1].trim()).toISOString();
          message = pm2Match[2].trim();
        }
        
        // Detect log level from content
        if (message.toLowerCase().includes('error') || message.toLowerCase().includes('err:')) {
          level = 'ERROR';
        } else if (message.toLowerCase().includes('warn')) {
          level = 'WARN';
        } else if (message.toLowerCase().includes('debug')) {
          level = 'DEBUG';
        }
        
        const logEvent = {
          type: 'log',
          timestamp,
          level,
          source: logFile.source,
          message
        };
        
        res.write(`data: ${JSON.stringify(logEvent)}\n\n`);
      }
    });
    
    tail.stderr.on('data', (data) => {
      // Ignore stderr from tail
    });
  }
  
  // Send heartbeat every 30 seconds to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() })}\n\n`);
  }, 30000);
  
  // Cleanup on client disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    for (const proc of tailProcesses) {
      proc.kill();
    }
  });
});

// GET /api/pm2/processes - List PM2 processes
app.get('/api/pm2/processes', requireAuth, async (req, res) => {
  try {
    const result = await new Promise((resolve, reject) => {
      exec('pm2 jlist', (error, stdout, stderr) => {
        if (error) return reject(new Error(stderr || error.message));
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new Error('Failed to parse PM2 output'));
        }
      });
    });
    
    res.json({ processes: result || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pm2/:name/restart - Restart PM2 process
app.post('/api/pm2/:name/restart', requireAuth, async (req, res) => {
  try {
    const { name } = req.params;
    
    await new Promise((resolve, reject) => {
      exec(`pm2 restart ${name}`, (error, stdout, stderr) => {
        if (error) return reject(new Error(stderr || error.message));
        resolve(stdout);
      });
    });
    
    res.json({ success: true, message: `${name} restarted` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pm2/:name/stop - Stop PM2 process
app.post('/api/pm2/:name/stop', requireAuth, async (req, res) => {
  try {
    const { name } = req.params;
    
    await new Promise((resolve, reject) => {
      exec(`pm2 stop ${name}`, (error, stdout, stderr) => {
        if (error) return reject(new Error(stderr || error.message));
        resolve(stdout);
      });
    });
    
    res.json({ success: true, message: `${name} stopped` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Background cache warmer — fetches slow CLI data so users get instant responses
async function warmCache() {
  try {
    const [versionResult, gatewayStatus, cronStatus] = await Promise.all([
      new Promise((resolve, reject) => {
        exec('openclaw --version', { timeout: 15000 }, (error, stdout) => {
          if (error) reject(error); else resolve(stdout.trim());
        });
      }),
      runOpenClaw('gateway status --json'),
      runOpenClaw('cron status --json')
    ]);

    let uptime = 'Unknown';
    if (gatewayStatus.service?.runtime?.pid) {
      const pid = gatewayStatus.service.runtime.pid;
      try {
        const psResult = await new Promise((resolve, reject) => {
          exec(`ps -p ${pid} -o etimes=`, (error, stdout) => {
            if (error) reject(error); else resolve(parseInt(stdout.trim()));
          });
        });
        const s = psResult;
        const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
        uptime = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
      } catch { uptime = 'Active'; }
    }

    setCache('status', {
      version: versionResult,
      uptime,
      sessionCount: cronStatus.jobs || 0,
      model: 'Opus 4.6',
      gatewayStatus: gatewayStatus.service?.runtime?.status || 'unknown'
    });

    // Warm sessions cache
    const sessionData = await runOpenClaw('sessions list --json');
    setCache('sessions', { sessions: (sessionData.sessions || []) });

    // Warm jobs cache
    const cronJobsData = await runOpenClaw('cron list --json');
    setCache('jobs', cronJobsData);

    console.log('Cache warmed successfully');
  } catch (err) {
    console.error('Cache warm failed:', err.message);
  }
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🦞 Atom Control Center running at http://localhost:${PORT}`);
  // Warm cache on startup
  warmCache();
  // Re-warm every 2 minutes
  setInterval(warmCache, 120000);
});
