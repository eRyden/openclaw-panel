# ⚛️ Atom Control Center

A comprehensive web dashboard for monitoring and managing OpenClaw's system status, active sessions, and scheduled tasks.

## 🚀 Quick Start

```bash
# Start the dashboard (if not already running)
cd /root/.openclaw/workspace/projects/cron-dashboard
npm start

# Or via PM2 (recommended)
pm2 start server.js --name cron-dashboard
```

**Access the dashboard:** http://localhost:3000

## 📊 Features

### System Status
Monitor OpenClaw's core metrics at a glance:
- OpenClaw version
- Gateway uptime
- Active session count
- Current model in use

### Active Sessions Monitor
View and manage all active sessions:
- Sub-agents, cron jobs, group chats, and main sessions
- Real-time status, runtime, and token usage
- Kill button for sub-agents and cron sessions
- Color-coded badges by session type

### Scheduled Tasks (Cron)
Complete cron job management:
- View all scheduled tasks with next run times
- Run jobs manually on demand
- Enable/disable jobs
- View last run status and duration
- Collapsible section with "View All" expansion
- Auto-sorted by next execution time

## 🔧 Management

```bash
# View status
pm2 status cron-dashboard

# Restart after changes
pm2 restart cron-dashboard

# View logs
pm2 logs cron-dashboard

# Stop
pm2 stop cron-dashboard
```

## 📡 API Endpoints

### `GET /api/status`
System-wide status information

### `GET /api/sessions`
List all active sessions with metadata

### `GET /api/jobs`
List all cron jobs with schedules

### `POST /api/jobs/:id/run`
Trigger a cron job manually

### `POST /api/jobs/:id/enable`
Enable a disabled cron job

### `POST /api/jobs/:id/disable`
Disable an active cron job

### `POST /api/sessions/:key/kill`
Terminate a session (sub-agents/cron only)

## 🎨 Design

- Dark theme optimized for terminal aesthetics
- Mobile-friendly responsive layout
- Auto-refresh every 30 seconds
- Real-time visual feedback for all actions
- Color-coded status indicators

## 📁 Project Structure

```
cron-dashboard/
├── server.js              # Express backend with API endpoints
├── public/
│   └── index.html        # Frontend dashboard (single page)
├── package.json          # Dependencies
└── README.md             # This file
```

## 🛠️ Tech Stack

- **Backend:** Node.js + Express
- **Frontend:** Vanilla JavaScript + Tailwind CSS
- **Process Manager:** PM2
- **Data Source:** OpenClaw CLI commands

## 📝 See Also

- [CONTROL-CENTER-SUMMARY.md](./CONTROL-CENTER-SUMMARY.md) - Detailed build summary and technical implementation
