// Actions Page Logic

window.actions = {
  processes: [],
  
  async load() {
    await this.loadPm2Processes();
    // Refresh Lucide icons after loading
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  },
  
  async loadPm2Processes() {
    try {
      const res = await fetch('/api/pm2/processes');
      const data = await res.json();
      this.processes = data.processes || [];
      this.renderProcesses();
    } catch (err) {
      console.error('Failed to load PM2 processes:', err);
      this.logToConsole('Failed to load PM2 processes: ' + err.message, 'error');
    }
  },
  
  renderProcesses() {
    const container = document.getElementById('pm2-processes-list');
    
    if (this.processes.length === 0) {
      container.innerHTML = '<div class="text-slate-500 text-center py-4">No PM2 processes found</div>';
      return;
    }
    
    container.innerHTML = this.processes.map(proc => {
      const status = proc.pm2_env?.status || 'unknown';
      const isOnline = status === 'online';
      const statusClass = isOnline ? 'bg-green-500' : 'bg-red-500';
      
      const cpu = proc.monit?.cpu || 0;
      const memory = proc.monit?.memory || 0;
      const uptime = proc.pm2_env?.pm_uptime;
      const restarts = proc.pm2_env?.restart_time || 0;
      
      return `
        <div class="process-item">
          <div>
            <div class="flex items-center gap-3 mb-2">
              <div class="w-2 h-2 rounded-full ${statusClass}"></div>
              <div class="font-semibold text-lg">${proc.name}</div>
              <span class="badge-secondary text-xs">${status}</span>
            </div>
            <div class="grid grid-cols-4 gap-4 text-sm text-slate-400">
              <div>
                <div class="text-xs text-slate-500">CPU</div>
                <div>${cpu}%</div>
              </div>
              <div>
                <div class="text-xs text-slate-500">Memory</div>
                <div>${window.utils.formatBytes(memory)}</div>
              </div>
              <div>
                <div class="text-xs text-slate-500">Uptime</div>
                <div>${uptime ? window.utils.formatDuration(Date.now() - uptime) : '-'}</div>
              </div>
              <div>
                <div class="text-xs text-slate-500">Restarts</div>
                <div>${restarts}</div>
              </div>
            </div>
          </div>
          <div class="flex gap-2">
            <button onclick="window.actions.restartProcess('${proc.name}')" 
                    class="btn-secondary text-sm px-4 py-2 flex items-center gap-2">
              <i data-lucide="refresh-cw" class="w-4 h-4"></i> Restart
            </button>
            <button onclick="window.actions.stopProcess('${proc.name}')" 
                    class="btn-danger text-sm px-4 py-2 flex items-center gap-2"
                    ${!isOnline ? 'disabled' : ''}>
              <i data-lucide="square" class="w-4 h-4"></i> Stop
            </button>
          </div>
        </div>
      `;
    }).join('');
    
    // Refresh icons after rendering
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  },
  
  async restartGateway() {
    if (!confirm('Restart the OpenClaw Gateway? This will interrupt all active connections.')) {
      return;
    }
    
    this.logToConsole('Restarting gateway...', 'info');
    
    try {
      const res = await fetch('/api/gateway/restart', { method: 'POST' });
      const data = await res.json();
      
      if (data.success) {
        this.logToConsole('Gateway restart initiated successfully', 'success');
      } else {
        this.logToConsole('Gateway restart failed: ' + (data.error || 'Unknown error'), 'error');
      }
    } catch (err) {
      this.logToConsole('Gateway restart failed: ' + err.message, 'error');
    }
  },
  
  async safeReload() {
    this.logToConsole('Performing safe reload...', 'info');
    
    try {
      // For now, just restart gateway - can implement a proper reload endpoint later
      const res = await fetch('/api/gateway/restart', { method: 'POST' });
      const data = await res.json();
      
      if (data.success) {
        this.logToConsole('Safe reload completed', 'success');
      } else {
        this.logToConsole('Safe reload failed: ' + (data.error || 'Unknown error'), 'error');
      }
    } catch (err) {
      this.logToConsole('Safe reload failed: ' + err.message, 'error');
    }
  },
  
  async clearCache() {
    this.logToConsole('Clearing cache...', 'info');
    
    try {
      const res = await fetch('/api/cache/clear', { method: 'POST' });
      const data = await res.json();
      
      if (data.success) {
        this.logToConsole('Cache cleared successfully', 'success');
      } else {
        this.logToConsole('Cache clear failed: ' + (data.error || 'Unknown error'), 'error');
      }
    } catch (err) {
      this.logToConsole('Cache clear failed: ' + err.message, 'error');
    }
  },
  
  async runBackup() {
    this.logToConsole('Starting backup to Atombox...', 'info');
    
    try {
      const res = await fetch('/api/backup', { method: 'POST' });
      const data = await res.json();
      
      if (data.success) {
        this.logToConsole('Backup completed successfully', 'success');
        if (data.output) {
          this.logToConsole(data.output, 'info');
        }
      } else {
        this.logToConsole('Backup failed: ' + (data.error || 'Unknown error'), 'error');
      }
    } catch (err) {
      this.logToConsole('Backup failed: ' + err.message, 'error');
    }
  },
  
  async restartProcess(name) {
    if (!confirm(`Restart PM2 process "${name}"?`)) {
      return;
    }
    
    this.logToConsole(`Restarting process: ${name}`, 'info');
    
    try {
      const res = await fetch(`/api/pm2/${name}/restart`, { method: 'POST' });
      const data = await res.json();
      
      if (data.success) {
        this.logToConsole(`Process ${name} restarted successfully`, 'success');
        await this.loadPm2Processes();
      } else {
        this.logToConsole(`Failed to restart ${name}: ` + (data.error || 'Unknown error'), 'error');
      }
    } catch (err) {
      this.logToConsole(`Failed to restart ${name}: ` + err.message, 'error');
    }
  },
  
  async stopProcess(name) {
    if (!confirm(`Stop PM2 process "${name}"?`)) {
      return;
    }
    
    this.logToConsole(`Stopping process: ${name}`, 'info');
    
    try {
      const res = await fetch(`/api/pm2/${name}/stop`, { method: 'POST' });
      const data = await res.json();
      
      if (data.success) {
        this.logToConsole(`Process ${name} stopped successfully`, 'success');
        await this.loadPm2Processes();
      } else {
        this.logToConsole(`Failed to stop ${name}: ` + (data.error || 'Unknown error'), 'error');
      }
    } catch (err) {
      this.logToConsole(`Failed to stop ${name}: ` + err.message, 'error');
    }
  },
  
  logToConsole(message, type = 'info') {
    const console = document.getElementById('action-console');
    const timestamp = new Date().toLocaleTimeString();
    
    const typeColors = {
      info: 'text-slate-300',
      success: 'text-green-400',
      error: 'text-red-400',
      warn: 'text-yellow-400'
    };
    
    const color = typeColors[type] || typeColors.info;
    
    const line = document.createElement('div');
    line.className = `${color} mb-1`;
    line.textContent = `[${timestamp}] ${message}`;
    
    console.appendChild(line);
    console.scrollTop = console.scrollHeight;
  }
};
