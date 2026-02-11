// Usage Page Logic

// Session key to friendly name mapping (same as dashboard.js)
const USAGE_SESSION_MAP = {
  'discord:channel:1469649078832074843': '#general',
  'discord:channel:1469649110981152881': '#trading',
  'discord:channel:1469649111904157901': '#primortal',
  'discord:channel:1469649112780636171': '#coding',
  'discord:channel:1469649113946787881': '#config',
  'discord:channel:1470844960667336766': '#socials',
  'agent:main:main': 'Main (Heartbeat)'
};

function formatUsageSessionName(key) {
  if (!key) return 'Unknown';
  
  // Check direct mappings first
  for (const [pattern, name] of Object.entries(USAGE_SESSION_MAP)) {
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
    const parts = key.split(':');
    if (parts.length > 2) {
      return parts.slice(-2).join(':').substring(0, 25) + '…';
    }
    return key.substring(0, 27) + '…';
  }
  
  return key;
}

window.usage = {
  data: null,
  
  async load() {
    try {
      const res = await fetch('/api/usage?range=30d');
      this.data = await res.json();
      this.render();
    } catch (err) {
      console.error('Failed to load usage data:', err);
    }
  },
  
  render() {
    if (!this.data) return;
    
    this.renderStats();
    this.renderCharts();
    this.renderTopSessions();
    
    // Refresh Lucide icons after rendering
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  },
  
  renderStats() {
    document.getElementById('usage-today').textContent = 
      window.utils.formatCost(this.data.totals?.today || 0);
    
    document.getElementById('usage-week').textContent = 
      window.utils.formatCost(this.data.totals?.week || 0);
    
    document.getElementById('usage-month').textContent = 
      window.utils.formatCost(this.data.totals?.month || 0);
  },
  
  renderCharts() {
    // Cost over time chart
    if (this.data.daily && this.data.daily.length > 0) {
      const labels = this.data.daily.map(d => d.date);
      const datasets = this.prepareModelDatasets(this.data.daily);
      
      window.charts.createCostChart('cost-chart', { labels, datasets });
    }
    
    // Model breakdown chart
    if (this.data.modelBreakdown && Object.keys(this.data.modelBreakdown).length > 0) {
      const labels = Object.keys(this.data.modelBreakdown);
      const values = Object.values(this.data.modelBreakdown);
      
      window.charts.createModelChart('model-chart', { labels, values });
    }
    
    // Token usage chart
    if (this.data.daily && this.data.daily.length > 0) {
      const labels = this.data.daily.map(d => d.date);
      const input = this.data.daily.map(d => d.inputTokens || 0);
      const output = this.data.daily.map(d => d.outputTokens || 0);
      
      window.charts.createTokenChart('token-chart', { labels, input, output });
    }
  },
  
  prepareModelDatasets(dailyCosts) {
    // Extract unique models
    const models = new Set();
    dailyCosts.forEach(day => {
      if (day.byModel) {
        Object.keys(day.byModel).forEach(model => models.add(model));
      }
    });
    
    // Create dataset for each model
    const modelColors = {
      'opus': '#8b5cf6',
      'sonnet': '#3b82f6',
      'haiku': '#22c55e',
      'codex': '#f59e0b',
      'claude-opus': '#8b5cf6',
      'claude-sonnet': '#3b82f6',
      'claude-haiku': '#22c55e',
      'gpt': '#10b981',
      'gemini': '#ec4899'
    };
    
    return Array.from(models).map(model => {
      // Find color based on partial model name match
      let color = '#6b7280';
      for (const [key, val] of Object.entries(modelColors)) {
        if (model.toLowerCase().includes(key)) {
          color = val;
          break;
        }
      }
      
      return {
        label: model,
        data: dailyCosts.map(day => (day.byModel && day.byModel[model]) || 0),
        backgroundColor: color,
        borderWidth: 0
      };
    });
  },
  
  renderTopSessions() {
    const container = document.getElementById('top-sessions-list');
    
    if (!this.data.topSessions || this.data.topSessions.length === 0) {
      container.innerHTML = '<div class="text-slate-500 text-center py-4">No session data available</div>';
      return;
    }
    
    container.innerHTML = this.data.topSessions.map(session => {
      // Use server-provided displayName or fallback to client-side mapping
      const displayName = session.displayName || formatUsageSessionName(session.key || session.name);
      
      return `
        <div class="session-item">
          <div class="flex-1">
            <div class="font-medium text-sm mb-1">${displayName}</div>
            <div class="flex gap-4 text-xs text-slate-500">
              <span>Model: ${session.model || 'unknown'}</span>
              <span>Tokens: ${((session.tokens || 0) / 1000).toFixed(1)}K</span>
            </div>
          </div>
          <div class="text-right">
            <div class="font-bold text-lg">${window.utils.formatCost(session.cost || 0)}</div>
          </div>
        </div>
      `;
    }).join('');
  }
};
