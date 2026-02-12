# 🦞 OpenClaw Control Center

A self-hosted dashboard for monitoring and managing your [OpenClaw](https://github.com/openclaw/openclaw) AI assistant.

![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- **Dashboard** — Gateway status, uptime, model info at a glance
- **Sessions** — View active sessions and sub-agents, kill stale ones
- **Live Logs** — Real-time streaming from PM2 logs via SSE
- **Cron Jobs** — View, enable/disable, and trigger cron jobs
- **Actions** — Quick actions (restart gateway, clear cache, run backups)
- **Projects** — Task board with projects, priorities, and assignees

## Requirements

- [OpenClaw](https://github.com/openclaw/openclaw) installed and running
- Node.js 18+
- PM2 (for log streaming)

## Quick Start

```bash
git clone <repo-url> openclaw-panel
cd openclaw-panel
npm install
cp .env.example .env
# Edit .env with your credentials
cp config.example.json config.json
# Edit config.json with your Discord channels, panel name, etc.
npm start
```

The panel runs on `http://localhost:3000` by default.

### Running with PM2

```bash
pm2 start server.js --name openclaw-panel
pm2 save
```

### Reverse Proxy (nginx)

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_buffering off;  # Important for SSE live logs
}
```

## Configuration

### Environment Variables (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH_USER` | `admin` | Login username |
| `AUTH_PASS` | `changeme` | Login password |
| `SESSION_SECRET` | random | Express session secret |
| `PORT` | `3000` | Server port |
| `PANEL_NAME` | `Control Center` | Name shown in sidebar |
| `PANEL_ICON` | `atom` | Lucide icon name for sidebar |

### Config File (`config.json`)

| Key | Type | Description |
|-----|------|-------------|
| `panelName` | string | Dashboard title and sidebar name |
| `panelIcon` | string | Lucide icon name for sidebar |
| `discordChannels` | object | Map of Discord channel IDs to display names |
| `backupCommand` | string | Custom backup shell command |
| `taskAssignees` | array | Valid assignee names for task board |

**Example `config.json`:**

```json
{
  "panelName": "My Control Center",
  "panelIcon": "terminal",
  "discordChannels": {
    "123456789012345678": "#general",
    "234567890123456789": "#coding"
  },
  "backupCommand": "/path/to/backup.sh",
  "taskAssignees": ["agent", "user", "team"]
}
```

## Tech Stack

- **Backend:** Node.js, Express, better-sqlite3
- **Frontend:** Tailwind CSS (CDN), Lucide Icons, Chart.js
- **Fonts:** Space Grotesk + JetBrains Mono

## License

MIT
