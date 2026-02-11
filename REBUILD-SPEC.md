# Control Center v2 — Rebuild Spec

## Overview
Complete UI rebuild of the Atom Control Center (port 3000, atom.ryden.io/).
Inspired by ClawdPanel design: dark slate theme, sidebar nav, clean card layouts.

## Design System
- **Background:** #0f1729 (deep navy/slate — matches ClawdPanel)
- **Sidebar:** #1a2332 (slightly lighter slate)
- **Cards:** #1e293b (slate-800) with subtle border #334155 (slate-700)
- **Accent:** #3b82f6 (blue-500) for highlights, active states
- **Danger:** #ef4444 (red) for destructive actions, errors
- **Success:** #22c55e (green) for healthy/running states
- **Warning:** #f59e0b (amber) for caution states
- **Text primary:** #f1f5f9 (slate-100)
- **Text secondary:** #94a3b8 (slate-400)
- **Font:** Inter (Google Fonts) or system-ui fallback
- **Icons:** Lucide icons (CDN) — same style as ClawdPanel

## Tech Stack (unchanged)
- Node.js + Express backend (server.js)
- Vanilla JS + Tailwind CSS (CDN) frontend
- Chart.js for graphs
- No build step — everything served from public/

## Authentication
- Keep existing session-based auth (login.html, express-session)
- Username: erik, Password: AtomHQ2026!
- 7-day cookie

## Layout
```
┌──────────┬─────────────────────────────────┐
│ Sidebar  │  Main Content Area              │
│          │                                 │
│ Logo     │  Page Title + Subtitle          │
│ v2026.x  │                                 │
│          │  [Page Content]                 │
│ Dashboard│                                 │
│ Usage    │                                 │
│ Live Logs│                                 │
│ Actions  │                                 │
│ Cron Jobs│                                 │
│ Projects │                                 │
│          │                                 │
│ ──────── │                                 │
│ Logout   │                                 │
└──────────┴─────────────────────────────────┘
```

Sidebar: fixed left, ~240px wide, collapsible on mobile (hamburger).
Active page highlighted with blue-500 background pill.

## Pages

### 1. Dashboard (/)
**Top stat cards (4 across):**
- CPU Usage — current %, subtitle "X Cores Active" (from /proc/stat)
- RAM Usage — current %, subtitle "X.XGB / X.XGB" (from /proc/meminfo)
- Disk I/O — usage %, subtitle mount point (from df)
- System Uptime — "Xd Xh Xm", subtitle "Since last reboot" (from /proc/uptime)

Each card: icon top-right (Lucide), large monospace number, small subtitle.

**CPU + RAM time-series graphs (side by side):**
- Chart.js line charts, 30-min window, sampled every 30 seconds
- Backend collects stats in memory array (max 60 data points = 30 min)
- Smooth lines, blue for CPU, green for RAM
- Y-axis 0-100%, X-axis time labels
- Auto-updates via polling every 30s

**Gateway Status card (left, below graphs):**
- Green dot + "Gateway Running" / Red dot + "Gateway Stopped"
- "Last restart: X ago"
- OpenClaw version number

**Active Sessions card (right, below graphs):**
- Badge: "X Active" (green pill)
- Scrollable list of sessions (max height ~300px)
- Each row: icon, name, model badge, status dot (green/amber/red), "..." menu
- Session types color-coded: Main (blue), Discord channels (purple), Sub-agents (orange), Cron (cyan)
- Click "..." → option to kill session

**Active Sub-agents card (below sessions):**
- Same scrollable format
- Shows: name, model, runtime, token count
- Kill button for each

### 2. Usage (/usage)
**Top stat cards (3 across):**
- Today's Cost — "$X.XX"
- This Week's Cost — "$X.XX"  
- This Month's Cost — "$X.XX"

**Cost Over Time chart:**
- Chart.js bar chart, daily costs for last 30 days
- Stacked by model (Opus=purple, Sonnet=blue, Haiku=green, Codex=orange)
- Hover shows breakdown

**Model Breakdown:**
- Doughnut/pie chart: % of spend per model
- Legend with actual dollar amounts

**Token Usage chart:**
- Line chart: daily input vs output tokens
- Dual Y-axis or stacked area

**Top Sessions by Cost:**
- Table/list: session name, model, total cost, token count
- Sortable, top 10

**Data source:** Parse all session transcript .jsonl files in /root/.openclaw/agents/main/sessions/
Each line with "cost" object has: input, output, cacheRead, cacheWrite, total
Aggregate by day, model, session.

Backend endpoint: GET /api/usage?range=7d|30d|all
Pre-compute on startup, update incrementally.

### 3. Live Logs (/logs)
**Header:** "Live Logs" + green dot "STREAMING" indicator + Pause/Export buttons

**Search bar** + **Level filter dropdown** (All Levels, INFO, WARN, ERROR, DEBUG)

**Log viewer:**
- Terminal-style dark background (#0d1117)
- Monospace font
- Color-coded: timestamps (gray), level badges ([INFO] green, [WARN] amber, [ERROR] red, [DEBUG] blue)
- Source labels color-coded: gateway (cyan), agent (green), system (blue), auth (purple)
- Auto-scroll to bottom, pause stops auto-scroll

**Data source:** Tail PM2 logs + gateway logs
Backend: WebSocket or SSE stream from `pm2 logs --raw` and `/root/.pm2/logs/`
Fallback: Poll endpoint every 2s

### 4. Actions (/actions)
**Action cards (2x2 grid):**
- **Restart Gateway** — red Execute button, warning text "Full process restart. Will drop connections."
- **Safe Reload** — green Run button, "Reload config without dropping connections."
- **Clear Cache** — gray Run button, "Flush internal caches."
- **Run Backup** — gray Run button, "Backup workspace to Atombox (Dropbox)."

**Output Console (right side):**
- Terminal-style output area showing command results
- Shows "ClawdPanel CLI v2.4.0" equivalent welcome text
- Each action appends output to console

**PM2 Processes section (below):**
- List all PM2 processes: name, status, CPU, memory, uptime, restarts
- Restart/Stop buttons per process
- Source: `pm2 jlist`

### 5. Cron Jobs (/cron)
**Stats cards (3 across):**
- Total Jobs / Active / Next Run

**Job list:**
- Sortable table/cards
- Name, schedule (human-readable), model, next run (countdown), last status
- Toggle enable/disable
- "Run Now" button
- Expand to see last 5 run history
- Keep all existing /api/jobs functionality

### 6. Projects (/projects)  
**Kanban board per project:**
- Project selector tabs (General, AtomTrader, Primortal)
- 3 columns: To Do | In Progress | Done
- Drag-and-drop cards (or click to move)
- Card shows: title, priority badge, assignee avatar
- Click card → edit modal (title, description, priority, assignee, status)
- Add task button per column
- Keep all existing /api/tasks functionality

## API Endpoints (new/modified)

### GET /api/system-stats
Returns real-time CPU, RAM, disk, uptime:
```json
{
  "cpu": { "percent": 49.5, "cores": 2 },
  "ram": { "percent": 60.8, "usedGB": 4.9, "totalGB": 8.0 },
  "disk": { "percent": 32.0, "mount": "/" },
  "uptime": { "seconds": 1234567, "formatted": "14d 2h 15m" }
}
```
Source: Parse /proc/stat (CPU delta), /proc/meminfo, df, /proc/uptime

### GET /api/system-stats/history
Returns last 30 min of CPU/RAM samples:
```json
{
  "timestamps": ["13:00", "13:00:30", ...],
  "cpu": [45.2, 48.1, ...],
  "ram": [60.1, 60.3, ...]
}
```

### GET /api/usage?range=7d|30d|all
Returns aggregated cost/token data from session transcripts.

### GET /api/logs/stream (SSE)
Server-sent events stream of log lines.

### GET /api/pm2/processes
Returns PM2 process list from `pm2 jlist`.

### POST /api/pm2/:name/restart
Restart a PM2 process.

### POST /api/pm2/:name/stop
Stop a PM2 process.

## File Structure
```
public/
  index.html          ← Single page app (all pages)
  login.html          ← Login page (keep existing)
  css/
    styles.css        ← Custom styles beyond Tailwind
  js/
    app.js            ← Router, sidebar, shared logic
    dashboard.js      ← Dashboard page
    usage.js          ← Usage page  
    logs.js           ← Live logs page
    actions.js        ← Actions page
    cron.js           ← Cron jobs page
    projects.js       ← Projects/tasks page
    charts.js         ← Chart.js helpers
server.js             ← Express backend (keep existing APIs, add new ones)
```

## Implementation Notes
- Keep ALL existing API endpoints working (jobs, sessions, tasks, status, etc.)
- Add new endpoints alongside existing ones
- Login page gets the same dark theme makeover
- Mobile: sidebar collapses to hamburger, cards stack vertically
- Auto-refresh: dashboard every 30s, logs streaming, usage on page load
- Chart.js loaded from CDN
- Lucide icons from CDN
- Inter font from Google Fonts CDN

## Reference Screenshots
Saved in: /root/.openclaw/media/inbound/
- 14471c58... → Dashboard (stat cards, gateway status, connected agents)
- cd3ad050... → Live Logs (streaming terminal, search, filters)
- c94665b0... → Actions (action cards, output console)
- 2f387e54... → Secrets Vault (skip this page — not needed)
