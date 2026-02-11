// Cron Jobs Page Logic

window.cron = {
  jobs: [],
  
  async load() {
    try {
      const res = await fetch('/api/jobs');
      const data = await res.json();
      this.jobs = data.jobs || [];
      this.render();
    } catch (err) {
      console.error('Failed to load cron jobs:', err);
      document.getElementById('cron-jobs-list').innerHTML = 
        `<div class="text-red-400 text-center py-8">Failed to load cron jobs: ${err.message}</div>`;
    }
  },
  
  render() {
    this.renderStats();
    this.renderJobs();
    // Refresh Lucide icons after rendering
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  },
  
  renderStats() {
    const enabled = this.jobs.filter(j => j.enabled);
    
    document.getElementById('cron-total').textContent = this.jobs.length;
    document.getElementById('cron-active').textContent = enabled.length;
    
    // Find next run
    const nextJob = enabled
      .filter(j => j.state?.nextRunAtMs)
      .sort((a, b) => a.state.nextRunAtMs - b.state.nextRunAtMs)[0];
    
    if (nextJob) {
      const nextEl = document.getElementById('cron-next');
      nextEl.textContent = this.formatTimeUntil(nextJob.state.nextRunAtMs);
      nextEl.className = 'stat-value text-cyan-400 text-lg';
    } else {
      document.getElementById('cron-next').textContent = '-';
    }
  },
  
  renderJobs() {
    const container = document.getElementById('cron-jobs-list');
    
    if (this.jobs.length === 0) {
      container.innerHTML = '<div class="text-slate-500 text-center py-8">No cron jobs configured</div>';
      return;
    }
    
    // Sort by next run time
    const sorted = [...this.jobs].sort((a, b) => {
      if (!a.enabled && b.enabled) return 1;
      if (a.enabled && !b.enabled) return -1;
      
      const aNext = a.state?.nextRunAtMs || Infinity;
      const bNext = b.state?.nextRunAtMs || Infinity;
      return aNext - bNext;
    });
    
    container.innerHTML = sorted.map(job => this.renderJob(job)).join('');
  },
  
  renderJob(job) {
    const state = job.state || {};
    const isMain = job.sessionTarget === 'main';
    const statusClass = state.lastStatus === 'ok' ? 'text-green-400' :
                       state.lastStatus === 'error' ? 'text-red-400' : 'text-slate-500';
    
    const badgeClass = isMain ? 'badge-primary' : 'badge-secondary';
    
    return `
      <div class="card ${!job.enabled ? 'opacity-50' : ''}">
        <div class="flex flex-col lg:flex-row justify-between gap-4">
          <div class="flex-1">
            <div class="flex items-center gap-3 mb-3 flex-wrap">
              <h3 class="text-xl font-semibold">${job.name || 'Unnamed Job'}</h3>
              <span class="${badgeClass} text-xs px-2 py-1 rounded">
                ${job.sessionTarget}
              </span>
              ${!job.enabled ? '<span class="badge-secondary text-xs px-2 py-1 rounded">disabled</span>' : ''}
            </div>
            
            <div class="grid grid-cols-2 lg:grid-cols-5 gap-4 text-sm">
              <div>
                <div class="text-slate-500 text-xs mb-1">Schedule</div>
                <div class="text-slate-300 font-mono text-xs">${this.formatSchedule(job.schedule)}</div>
              </div>
              <div>
                <div class="text-slate-500 text-xs mb-1">Model</div>
                <div class="text-purple-400 text-xs">${job.model || 'Default'}</div>
              </div>
              <div>
                <div class="text-slate-500 text-xs mb-1">Next Run</div>
                <div class="text-cyan-400 text-xs">${this.formatTime(state.nextRunAtMs)}</div>
              </div>
              <div>
                <div class="text-slate-500 text-xs mb-1">Last Run</div>
                <div class="${statusClass} text-xs">${state.lastStatus || '-'}</div>
              </div>
              <div>
                <div class="text-slate-500 text-xs mb-1">Duration</div>
                <div class="text-slate-300 text-xs">${this.formatDuration(state.lastDurationMs)}</div>
              </div>
            </div>
          </div>
          
          <div class="flex gap-2 lg:flex-col lg:justify-center">
            <button onclick="window.cron.runJob('${job.id}')" 
                    class="btn-success px-4 py-2 flex-1 lg:flex-none flex items-center justify-center gap-2">
              <i data-lucide="play" class="w-4 h-4"></i> Run
            </button>
            <button onclick="window.cron.toggleJob('${job.id}', ${!job.enabled})" 
                    class="btn-${job.enabled ? 'danger' : 'primary'} px-4 py-2 flex-1 lg:flex-none">
              ${job.enabled ? 'Disable' : 'Enable'}
            </button>
          </div>
        </div>
      </div>
    `;
  },
  
  formatSchedule(schedule) {
    if (!schedule) return '-';
    if (schedule.kind === 'cron') {
      return `${schedule.expr}`;
    }
    if (schedule.kind === 'every') {
      const minutes = Math.round(schedule.everyMs / 60000);
      return `Every ${minutes}m`;
    }
    return JSON.stringify(schedule);
  },
  
  formatTime(ms) {
    if (!ms) return '-';
    
    const diff = ms - Date.now();
    
    if (diff > 0 && diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      if (hours > 0) return `in ${hours}h ${mins}m`;
      return `in ${mins}m`;
    }
    
    return new Date(ms).toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
  },
  
  formatTimeUntil(ms) {
    if (!ms) return '-';
    
    const diff = ms - Date.now();
    
    if (diff < 0) return 'overdue';
    if (diff < 60000) return '< 1m';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return `${Math.floor(diff / 86400000)}d`;
  },
  
  formatDuration(ms) {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  },
  
  async runJob(id) {
    try {
      const res = await fetch(`/api/jobs/${id}/run`, { method: 'POST' });
      const data = await res.json();
      
      if (data.success || !data.error) {
        // Reload jobs after a delay to see the result
        setTimeout(() => this.load(), 2000);
      } else {
        alert('Failed to run job: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Failed to run job: ' + err.message);
    }
  },
  
  async toggleJob(id, enable) {
    try {
      const endpoint = enable ? 'enable' : 'disable';
      const res = await fetch(`/api/jobs/${id}/${endpoint}`, { method: 'POST' });
      const data = await res.json();
      
      if (data.success || !data.error) {
        await this.load();
      } else {
        alert(`Failed to ${endpoint} job: ` + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert(`Failed to ${enable ? 'enable' : 'disable'} job: ` + err.message);
    }
  }
};
