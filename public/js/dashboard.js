// Dashboard Page Logic

// Session key to friendly name mapping
const SESSION_NAME_MAP = {
  'discord:channel:1469649078832074843': '#general',
  'discord:channel:1469649110981152881': '#trading',
  'discord:channel:1469649111904157901': '#primortal',
  'discord:channel:1469649112780636171': '#coding',
  'discord:channel:1469649113946787881': '#config',
  'discord:channel:1470844960667336766': '#socials',
  'agent:main:main': 'Main (Heartbeat)'
};

function formatSessionName(key) {
  // Check direct mappings first
  for (const [pattern, name] of Object.entries(SESSION_NAME_MAP)) {
    if (key.includes(pattern)) {
      return name;
    }
  }
  
  // Sub-agent pattern
  if (key.includes('subagent')) {
    const parts = key.split(':');
    const uuid = parts[parts.length - 1];
    return 'Sub-agent: ' + uuid.substring(0, 8);
  }
  
  // Cron job pattern
  if (key.includes('cron:')) {
    return 'Cron Job';
  }
  
  // Fallback: truncate intelligently
  if (key.length > 30) {
    // Try to extract meaningful part
    const parts = key.split(':');
    if (parts.length > 2) {
      return parts.slice(-2).join(':').substring(0, 25) + '…';
    }
    return key.substring(0, 27) + '…';
  }
  
  return key;
}

window.dashboard = {
  data: {
    stats: null,
    sessions: [],
    history: null
  },
  
  async load() {
    await Promise.all([
      this.loadSystemStats(),
      this.loadSystemHistory(),
      this.loadSessions()
    ]);
    // Refresh Lucide icons after loading
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  },
  
  async loadSystemStats() {
    try {
      const res = await fetch('/api/system-stats');
      const data = await res.json();
      this.data.stats = data;
      this.renderStats();
    } catch (err) {
      console.error('Failed to load system stats:', err);
    }
  },
  
  async loadSystemHistory() {
    try {
      const res = await fetch('/api/system-stats/history');
      const data = await res.json();
      this.data.history = data;
      this.renderCharts();
    } catch (err) {
      console.error('Failed to load system history:', err);
    }
  },
  
  async loadSessions() {
    try {
      const res = await fetch('/api/sessions');
      const data = await res.json();
      this.data.sessions = data.sessions || [];
      this.renderSessions();
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  },
  
  renderStats() {
    const stats = this.data.stats;
    if (!stats) return;
    
    // CPU
    document.getElementById('cpu-percent').textContent = stats.cpu.percent + '%';
    document.getElementById('cpu-subtitle').textContent = `${stats.cpu.cores} Cores Active`;
    
    // RAM
    document.getElementById('ram-percent').textContent = stats.ram.percent + '%';
    document.getElementById('ram-subtitle').textContent = 
      `${stats.ram.usedGB}GB / ${stats.ram.totalGB}GB`;
    
    // Disk
    document.getElementById('disk-percent').textContent = stats.disk.percent + '%';
    document.getElementById('disk-subtitle').textContent = stats.disk.mount;
    
    // Uptime - keep days/hours/minutes but tight spacing
    let uptimeStr = stats.uptime.formatted;
    if (stats.uptime.seconds > 86400) {
      const days = Math.floor(stats.uptime.seconds / 86400);
      const hours = Math.floor((stats.uptime.seconds % 86400) / 3600);
      const mins = Math.floor((stats.uptime.seconds % 3600) / 60);
      uptimeStr = `${days}d ${hours}h ${mins}m`;
    }
    document.getElementById('uptime-value').textContent = uptimeStr;
  },
  
  renderCharts() {
    const history = this.data.history;
    if (!history || !history.timestamps.length) {
      console.log('No history data available yet');
      return;
    }
    
    // CPU Chart
    window.charts.createCpuChart('cpu-chart', {
      labels: history.timestamps,
      values: history.cpu
    });
    
    // RAM Chart
    window.charts.createRamChart('ram-chart', {
      labels: history.timestamps,
      values: history.ram
    });
  },
  
  renderSessions() {
    const sessions = this.data.sessions;
    
    // Filter regular sessions and sub-agents
    const regularSessions = sessions.filter(s => !s.isSubagent);
    const subagents = sessions.filter(s => s.isSubagent);
    
    // Update badges
    document.getElementById('sessions-badge').textContent = `${regularSessions.length} Active`;
    document.getElementById('subagents-badge').textContent = `${subagents.length} Active`;
    
    // Render regular sessions
    const sessionsList = document.getElementById('sessions-list');
    if (regularSessions.length === 0) {
      sessionsList.innerHTML = '<div class="text-slate-500 text-center py-4">No active sessions</div>';
    } else {
      sessionsList.innerHTML = regularSessions.map(s => this.renderSessionItem(s)).join('');
    }
    
    // Render sub-agents
    const subagentsList = document.getElementById('subagents-list');
    if (subagents.length === 0) {
      subagentsList.innerHTML = '<div class="text-slate-500 text-center py-4">No active sub-agents</div>';
    } else {
      subagentsList.innerHTML = subagents.map(s => this.renderSubagentItem(s)).join('');
    }
  },
  
  renderSessionItem(session) {
    const badgeColor = session.kind === 'group' ? 'bg-green-500' : 
                       session.isCron ? 'bg-purple-500' : 'bg-cyan-500';
    
    // Use friendly name mapping
    const displayName = formatSessionName(session.key);
    
    return `
      <div class="session-item">
        <div class="flex items-center gap-3">
          <div class="status-dot ${session.status === 'active' ? 'green' : 'amber'}"></div>
          <div>
            <div class="font-medium text-sm">${displayName}</div>
            <div class="text-xs text-slate-500">${session.model.split('/').pop()}</div>
          </div>
        </div>
        <div class="text-xs text-slate-400">
          ${session.runtime}
        </div>
      </div>
    `;
  },
  
  renderSubagentItem(session) {
    // Use friendly name mapping
    const displayName = formatSessionName(session.key);
    
    return `
      <div class="session-item">
        <div class="flex-1">
          <div class="flex items-center gap-3 mb-1">
            <div class="status-dot green"></div>
            <div class="font-medium text-sm">${displayName}</div>
          </div>
          <div class="flex gap-4 text-xs text-slate-500">
            <span>Model: ${session.model.split('/').pop()}</span>
            <span>Runtime: ${session.runtime}</span>
            <span>Tokens: ${(session.tokens / 1000).toFixed(1)}K</span>
          </div>
        </div>
        <button onclick="dashboard.killSession('${encodeURIComponent(session.key)}')" 
                class="btn-danger text-xs px-3 py-1">
          Kill
        </button>
      </div>
    `;
  },
  
  async killSession(key) {
    if (!confirm('Kill this sub-agent session?')) return;
    
    try {
      const res = await fetch(`/api/sessions/${key}/kill`, { method: 'POST' });
      const data = await res.json();
      
      if (data.success) {
        // Reload sessions
        await this.loadSessions();
      } else {
        alert(data.error || 'Failed to kill session');
      }
    } catch (err) {
      alert('Failed to kill session: ' + err.message);
    }
  }
};
