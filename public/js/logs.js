// Live Logs Page Logic

window.logs = {
  eventSource: null,
  logs: [],
  paused: false,
  filterLevel: '',
  searchQuery: '',
  controlsInitialized: false,
  
  connect() {
    if (this.eventSource) {
      this.eventSource.close();
    }
    
    this.logs = [];
    this.paused = false;
    
    if (!this.controlsInitialized) {
      this.initControls();
      this.controlsInitialized = true;
    }
    
    this.startStream();
  },
  
  initControls() {
    // Pause button
    const pauseBtn = document.getElementById('pause-logs');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => {
        this.togglePause();
      });
    }
    
    // Export button
    const exportBtn = document.getElementById('export-logs');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        this.exportLogs();
      });
    }
    
    // Search input
    const searchInput = document.getElementById('log-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase();
        this.renderLogs();
      });
    }
    
    // Level filter
    const levelFilter = document.getElementById('log-level-filter');
    if (levelFilter) {
      levelFilter.addEventListener('change', (e) => {
        this.filterLevel = e.target.value;
        this.renderLogs();
      });
    }
  },
  
  startStream() {
    const viewer = document.getElementById('log-viewer');
    const statusDot = document.getElementById('log-stream-dot');
    const statusText = document.getElementById('log-stream-status');
    
    viewer.innerHTML = '<div class="text-slate-500">Connecting to log stream...</div>';
    
    this.eventSource = new EventSource('/api/logs/stream');
    
    this.eventSource.onopen = () => {
      if (statusDot) {
        statusDot.className = 'w-2 h-2 rounded-full bg-green-500 animate-pulse';
      }
      if (statusText) {
        statusText.textContent = 'STREAMING';
        statusText.className = 'text-green-400 text-sm';
      }
    };
    
    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'connected') {
          viewer.innerHTML = '<div class="text-green-500">Connected to log stream</div>';
          return;
        }
        
        if (data.type === 'log') {
          this.addLog(data);
        }
      } catch (err) {
        console.error('Failed to parse log event:', err);
      }
    };
    
    this.eventSource.onerror = (err) => {
      console.error('Log stream error:', err);
      
      if (statusDot) {
        statusDot.className = 'w-2 h-2 rounded-full bg-red-500';
      }
      if (statusText) {
        statusText.textContent = 'DISCONNECTED';
        statusText.className = 'text-red-400 text-sm';
      }
      
      viewer.innerHTML = '<div class="text-red-500">Connection lost. Reconnecting in 3 seconds...</div>';
      
      // Close the current connection
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
      }
      
      // Reconnect after 3 seconds
      setTimeout(() => {
        if (window.appState?.currentPage === 'logs') {
          this.startStream();
        }
      }, 3000);
    };
  },
  
  addLog(log) {
    this.logs.push(log);
    
    // Keep only last 500 logs
    if (this.logs.length > 500) {
      this.logs.shift();
    }
    
    if (!this.paused) {
      this.renderLogs();
    }
  },
  
  renderLogs() {
    const viewer = document.getElementById('log-viewer');
    
    // Filter logs
    let filtered = this.logs;
    
    if (this.filterLevel) {
      filtered = filtered.filter(log => log.level === this.filterLevel);
    }
    
    if (this.searchQuery) {
      filtered = filtered.filter(log => 
        (log.message && log.message.toLowerCase().includes(this.searchQuery)) ||
        (log.source && log.source.toLowerCase().includes(this.searchQuery))
      );
    }
    
    if (filtered.length === 0) {
      viewer.innerHTML = '<div class="text-slate-500">No logs match your filters</div>';
      return;
    }
    
    // Render logs
    viewer.innerHTML = filtered.map(log => this.renderLogLine(log)).join('');
    
    // Auto-scroll to bottom if not paused
    if (!this.paused) {
      viewer.scrollTop = viewer.scrollHeight;
    }
  },
  
  renderLogLine(log) {
    const timestamp = new Date(log.timestamp).toLocaleTimeString();
    const levelClass = `log-level-${log.level}`;
    
    const sourceColors = {
      gateway: 'text-cyan-400',
      agent: 'text-green-400',
      system: 'text-blue-400',
      auth: 'text-purple-400',
      atomtrader: 'text-yellow-400',
      'cron-dashboard': 'text-pink-400'
    };
    
    const sourceClass = sourceColors[log.source] || 'text-slate-400';
    
    return `
      <div class="log-line">
        <span class="log-timestamp">${timestamp}</span>
        <span class="${levelClass} font-bold ml-2">[${log.level}]</span>
        <span class="${sourceClass} ml-2">[${log.source}]</span>
        <span class="ml-2">${this.escapeHtml(log.message)}</span>
      </div>
    `;
  },
  
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },
  
  togglePause() {
    this.paused = !this.paused;
    const btn = document.getElementById('pause-logs');
    if (btn) {
      btn.textContent = this.paused ? 'Resume' : 'Pause';
      btn.classList.toggle('btn-success', this.paused);
      btn.classList.toggle('btn-secondary', !this.paused);
    }
    
    if (!this.paused) {
      this.renderLogs();
    }
  },
  
  exportLogs() {
    const content = this.logs.map(log => {
      const timestamp = new Date(log.timestamp).toISOString();
      return `[${timestamp}] [${log.level}] [${log.source}] ${log.message}`;
    }).join('\n');
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${Date.now()}.txt`;
    a.click();
    
    URL.revokeObjectURL(url);
  },
  
  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
};
