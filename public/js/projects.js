// Hive Pipeline Dashboard Logic

window.projects = {
  hiveData: null,
  selectedProject: 'all',
  archiveOpen: false,
  pollInterval: null,
  projectCache: [],

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const bgColors = {
      success: 'bg-green-500',
      error: 'bg-red-500',
      info: 'bg-blue-500',
      warning: 'bg-amber-500'
    };

    const icons = {
      success: 'check-circle',
      error: 'alert-circle',
      info: 'info',
      warning: 'alert-triangle'
    };

    toast.className = `${bgColors[type]} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 min-w-[280px] max-w-md animate-slide-in`;
    toast.innerHTML = `
      <i data-lucide="${icons[type]}" class="w-5 h-5 flex-shrink-0"></i>
      <span class="flex-1 text-sm">${message}</span>
      <button onclick="this.parentElement.remove()" class="text-white/80 hover:text-white">
        <i data-lucide="x" class="w-4 h-4"></i>
      </button>
    `;

    container.appendChild(toast);
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(400px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  },

  load() {
    this.loadHiveDashboard();
    this.startPolling();
  },

  startPolling() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.pollInterval = setInterval(() => {
      if (window.appState?.currentPage === 'projects') {
        this.loadHiveDashboard();
      }
    }, 3000);
  },

  async loadHiveDashboard() {
    if (window.appState?.currentPage !== 'projects') return;
    try {
      const res = await fetch('/api/hive/dashboard');
      const data = await res.json();
      this.hiveData = data || {};
      this.renderProjectTabs();
      this.renderKanban();
    } catch (err) {
      console.error('Failed to load hive dashboard:', err);
      this.showToast('Failed to load Hive dashboard', 'error');
    }
  },

  renderProjectTabs() {
    const container = document.getElementById('hiveProjectTabs');
    if (!container) return;

    const projects = this.hiveData?.projects || this.projectCache || [];
    const derived = projects.length ? projects : this.deriveProjectsFromTasks();
    this.projectCache = derived;

    // Sort: General first, then alphabetical
    const general = derived.filter(p => p.name === 'General');
    const others = derived.filter(p => p.name !== 'General').sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const sorted = [...general, ...others];

    const buttons = [
      `<button class="px-3 py-1.5 rounded-full text-sm font-medium ${this.selectedProject === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}" onclick="filterHiveProject('all')">All</button>`
    ];

    sorted.forEach(project => {
      const id = project.id ?? project.project_id ?? project.name;
      const name = project.name || project.title || 'Unnamed';
      const active = this.selectedProject === String(id);
      const isDeletable = name !== 'General';
      const deleteBtn = isDeletable ? `<span class="ml-1 text-slate-500 hover:text-red-400 transition cursor-pointer" onclick="event.stopPropagation(); deleteProject(${project.id})">✕</span>` : '';
      buttons.push(`
        <button class="group px-3 py-1.5 rounded-full text-sm font-medium inline-flex items-center ${active ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}" onclick="filterHiveProject('${id}')">${name}${deleteBtn}</button>
      `);
    });

    container.innerHTML = buttons.join('');
  },

  renderKanban() {
    const kanban = document.getElementById('hiveKanban');
    if (!kanban) return;

    const stages = [
      { key: 'plan', label: 'Plan', color: 'text-slate-200', accent: 'bg-slate-700/40 border-slate-600' },
      { key: 'implement', label: 'In Progress', color: 'text-blue-200', accent: 'bg-blue-900/30 border-blue-700/50' },
      { key: 'verify', label: 'Verify', color: 'text-amber-200', accent: 'bg-amber-900/20 border-amber-700/40' },
      { key: 'test', label: 'Test', color: 'text-purple-200', accent: 'bg-purple-900/20 border-purple-700/40' },
      { key: 'deploy', label: 'Deploy', color: 'text-cyan-200', accent: 'bg-cyan-900/20 border-cyan-700/40' },
      { key: 'done', label: 'Done', color: 'text-emerald-200', accent: 'bg-emerald-900/20 border-emerald-700/40' }
    ];

    const stageTasks = this.getStageTasks();
    const archived = this.hiveData?.archived || [];
    const allTasks = Object.values(stageTasks).flat();
    const taskMap = {};
    allTasks.forEach(task => {
      if (task && task.id !== undefined && task.id !== null) {
        taskMap[task.id] = task;
      }
    });

    kanban.innerHTML = `
      <div class="grid grid-cols-6 gap-3" style="min-width: 900px;">
        ${stages.map(stage => {
          const tasks = stageTasks[stage.key] || [];
          const count = tasks.length;
          return `
            <div class=\"bg-slate-900/60 border border-slate-600 rounded-xl p-3 flex flex-col min-h-[520px]\">
              <div class=\"flex items-center justify-between mb-3 px-2 py-2 rounded-lg border ${stage.accent}\">
                <span class=\"text-sm font-semibold ${stage.color}\">${stage.label}</span>
                <span class=\"text-xs font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300\">${count}</span>
              </div>
              <div class=\"flex-1 overflow-y-auto pr-1\" style=\"max-height: 520px;\">
                ${tasks.length ? tasks.map(task => this.renderTaskCard(task, { taskMap })).join('') : '<div class="text-slate-600 text-xs text-center py-6">No tasks</div>'}
              </div>
            </div>
          `;
        }).join('')}
      </div>
      <div class="mt-8 border-t border-slate-700 pt-4">
        <button onclick="toggleArchive()" class="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition">
          <i data-lucide="archive" class="w-4 h-4"></i>
          <span>Archive</span>
          <span id="archiveCount" class="text-xs bg-slate-700 px-2 py-0.5 rounded-full">${archived.length}</span>
          <i data-lucide="chevron-down" id="archiveChevron" class="w-4 h-4 transition-transform" style="${this.archiveOpen ? 'transform:rotate(180deg)' : ''}"></i>
        </button>
        <div id="archiveContainer" class="${this.archiveOpen ? '' : 'hidden'} mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          ${archived.length ? archived.map(task => this.renderArchivedTaskCard(task)).join('') : '<div class="text-slate-600 text-xs">No archived tasks.</div>'}
        </div>
      </div>
    `;

    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  },

  getStageTasks() {
    const data = this.hiveData || {};
    const stages = {
      plan: data.plan || data.plan_tasks || [],
      implement: data.implement || data.implement_tasks || [],
      verify: data.verify || data.verify_tasks || [],
      test: data.test || data.test_tasks || [],
      deploy: data.deploy || data.deploy_tasks || [],
      done: data.done || data.done_tasks || []
    };

    if (data.stages) {
      Object.keys(stages).forEach(key => {
        if (data.stages[key]) stages[key] = data.stages[key];
      });
    }

    if (data.tasks_by_stage) {
      Object.keys(stages).forEach(key => {
        if (data.tasks_by_stage[key]) stages[key] = data.tasks_by_stage[key];
      });
    }

    if (data.tasks && Array.isArray(data.tasks)) {
      Object.keys(stages).forEach(key => (stages[key] = []));
      data.tasks.forEach(task => {
        const stage = (task.stage || 'plan').toLowerCase();
        if (stages[stage]) stages[stage].push(task);
      });
    }

    if (this.selectedProject !== 'all') {
      Object.keys(stages).forEach(key => {
        stages[key] = stages[key].filter(task => String(task.project_id || task.projectId || task.project?.id || task.project) === String(this.selectedProject));
      });
    }

    const allTasks = Object.values(stages).flat();
    const parentIdSet = new Set(allTasks.map(task => task.parent_id).filter(Boolean));

    Object.keys(stages).forEach(key => {
      stages[key] = stages[key].filter(task => {
        const isSubtask = !!task.parent_id;
        const isParent = parentIdSet.has(task.id);
        // Subtasks: only show in active pipeline columns, never plan/done
        if (isSubtask && ['plan', 'done'].includes(key)) return false;
        // Subtasks in plan stage haven't started yet — hide them entirely
        if (isSubtask && (task.stage === 'plan' || task.status === 'plan')) return false;
        // Parents: only show in plan/done, never middle columns
        if (isParent && !['plan', 'done'].includes(key)) return false;
        return true;
      });
    });

    return stages;
  },

  renderTaskCard(task, { taskMap } = {}) {
    const title = task.title || 'Untitled Task';
    const projectName = task.project_name || task.project?.name || task.project || 'Unknown Project';
    const priority = (task.priority || 'normal').toLowerCase();
    const status = (task.status || '').toLowerCase();
    const stage = (task.stage || '').toLowerCase();
    const time = this.timeAgo(task.updated_at || task.created_at || task.started_at || task.completed_at);
    const isSubtask = !!task.parent_id;
    const parentTitle = isSubtask && taskMap ? taskMap[task.parent_id]?.title : null;
    const displayProjectName = isSubtask ? (parentTitle || projectName) : projectName;
    const taskTypeBadge = !isSubtask && task.task_type === 'creative'
      ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-purple-600/20 text-purple-300 border border-purple-500/30">creative</span>'
      : '';

    const priorityColors = {
      low: 'text-slate-400',
      normal: 'text-blue-400',
      high: 'text-amber-400',
      urgent: 'text-red-400'
    };

    const statusIndicator = this.renderStatusIndicator(task);
    const greenlightButton = stage === 'plan'
      ? (task.greenlit
        ? `<button onclick="event.stopPropagation(); greenlightTask(${task.id})" class="text-xs px-2 py-1 rounded-md bg-emerald-600/30 text-emerald-300 border border-emerald-500/50 hover:bg-emerald-600/40">✓ Greenlit</button>`
        : `<button onclick="event.stopPropagation(); greenlightTask(${task.id})" class="text-xs px-2 py-1 rounded-md bg-amber-600/20 text-amber-300 border border-amber-500/40 hover:bg-amber-600/40">Greenlight</button>`)
      : '';

    const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
    const subtaskCount = task.subtask_count ?? subtasks.length;
    const completedSubtasks = subtasks.filter(subtask => ['done', 'completed', 'complete'].includes((subtask.status || subtask.stage || '').toLowerCase())).length;
    const progressCount = subtaskCount ? (subtasks.length ? completedSubtasks : (task.subtask_completed_count ?? 0)) : 0;
    const progressPercent = subtaskCount ? Math.min(100, Math.round((progressCount / subtaskCount) * 100)) : 0;
    const showSubtasks = subtaskCount > 0;

    const parentName = task.parent_title || task.parent_task_title || task.parent?.title || task.parent_task?.title;
    const parentTag = !isSubtask && parentName ? `<span class="text-xs text-slate-500">↳ ${parentName}</span>` : '';

    const doneButtons = stage === 'done' ? `
      <div class="flex gap-2 mt-2 pt-2 border-t border-slate-700">
        <button onclick="event.stopPropagation(); showFeedbackModal(${task.id})" class="flex-1 text-xs px-2 py-1 rounded bg-blue-600/20 text-blue-300 border border-blue-500/30 hover:bg-blue-600/30">Feedback</button>
        <button onclick="event.stopPropagation(); archiveTask(${task.id})" class="flex-1 text-xs px-2 py-1 rounded bg-slate-600/20 text-slate-300 border border-slate-500/30 hover:bg-slate-600/30">Archive</button>
      </div>
    ` : '';

    const titlePrefix = isSubtask ? '↳ ' : '';
    const cardBorder = isSubtask ? 'border-blue-500/30' : 'border-slate-700';
    const titleSize = isSubtask ? 'text-xs' : 'text-sm';

    return `
      <div class="bg-slate-800 border ${cardBorder} rounded-lg p-3 mb-2 cursor-pointer hover:border-slate-500 transition" onclick="showTaskDetail(${task.id})">
        <div class="flex items-start justify-between mb-1 gap-2">
          <span class="text-white ${titleSize} font-medium leading-tight">${titlePrefix}${title}</span>
          <span class="text-xs ${priorityColors[priority] || 'text-blue-400'}">●</span>
        </div>
        <div class="text-slate-500 text-xs flex items-center gap-2">
          <span>${displayProjectName}</span>
          ${taskTypeBadge}
        </div>
        ${parentTag}
        ${showSubtasks ? `
          <div class="w-full h-1.5 bg-slate-700 rounded-full mt-2">
            <div class="h-1.5 bg-blue-500 rounded-full" style="width: ${progressPercent}%"></div>
          </div>
          <span class="text-xs text-slate-400">${progressCount}/${subtaskCount} subtasks</span>
        ` : ''}
        <div class="flex items-center justify-between mt-2">
          <span class="text-xs text-slate-400">${time}</span>
          <div class="flex items-center gap-2">${greenlightButton}${statusIndicator}</div>
        </div>
        ${doneButtons}
      </div>
    `;
  },

  renderStatusIndicator(task) {
    const status = (task.status || '').toLowerCase();
    const stage = (task.stage || '').toLowerCase();
    if (status === 'running' || stage === 'implement' || stage === 'verify' || stage === 'test' || stage === 'deploy') {
      if (status === 'paused') {
        return '<span class="text-xs text-amber-300">⏸</span>';
      }
      if (status === 'failed') {
        return '<span class="text-xs text-red-400">✕</span>';
      }
      if (status === 'done' || stage === 'done') {
        return '<span class="text-xs text-green-400">✓</span>';
      }
      return '<span class="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>';
    }
    if (status === 'failed') return '<span class="text-xs text-red-400">✕</span>';
    if (status === 'done') return '<span class="text-xs text-green-400">✓</span>';
    return '';
  },

  renderArchivedTaskCard(task) {
    const title = task.title || 'Untitled Task';
    const projectName = task.project_name || task.project?.name || task.project || 'Unknown Project';
    const completed = this.timeAgo(task.completed_at || task.updated_at || task.created_at);
    const linkedId = task.linked_from_id || task.linked_from?.id || task.linked_from_task?.id;
    const linkedTitle = task.linked_from_title || task.linked_from?.title || task.linked_from_task?.title;
    const linkedLabel = linkedTitle ? `Iteration of: ${linkedTitle}` : '';

    return `
      <div class="bg-slate-900/70 border border-slate-700 rounded-lg p-3">
        <div class="text-white text-sm font-medium">${title}</div>
        <div class="text-xs text-slate-500 mt-1">${projectName}</div>
        <div class="text-xs text-slate-400 mt-2">Completed ${completed}</div>
        ${linkedLabel ? `<div class="text-xs text-slate-500 mt-1"><button class="text-blue-400 hover:text-blue-300" onclick="showTaskDetail(${linkedId})">${linkedLabel}</button></div>` : ''}
      </div>
    `;
  },

  deriveProjectsFromTasks() {
    const tasks = this.hiveData?.tasks || [];
    const map = new Map();
    tasks.forEach(task => {
      const id = task.project_id || task.projectId || task.project?.id || task.project;
      const name = task.project_name || task.project?.name || task.project || 'Unknown';
      if (!map.has(id)) map.set(id, { id, name });
    });
    return Array.from(map.values()).filter(p => p.id !== undefined && p.id !== null);
  },

  timeAgo(dateStr) {
    if (!dateStr) return '—';
    // SQLite datetimes are UTC but lack 'Z' suffix
    const normalized = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z';
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return '—';
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 0) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  },

  async showTaskDetail(taskId) {
    try {
      const [taskRes, tasksRes] = await Promise.all([
        fetch(`/api/hive/tasks/${taskId}`),
        fetch('/api/hive/tasks')
      ]);
      const task = await taskRes.json();
      const allTasks = await tasksRes.json();
      const tasksList = allTasks?.tasks || allTasks || [];
      const subtasks = Array.isArray(tasksList)
        ? tasksList.filter(item => String(item.parent_id) === String(taskId))
        : [];
      task.subtasks = subtasks;
      this.renderTaskPanel(task);
    } catch (err) {
      console.error('Failed to load task detail:', err);
      this.showToast('Failed to load task detail', 'error');
    }
  },

  renderTaskPanel(task) {
    let panel = document.getElementById('hive-task-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'hive-task-panel';
      panel.className = 'fixed inset-0 z-50 flex';
      panel.innerHTML = `
        <div class="flex-1 bg-black/40" onclick="closeHivePanel()"></div>
        <div class="w-full max-w-xl bg-slate-900 border-l border-slate-700 h-full overflow-y-auto transform translate-x-full transition-transform duration-300" id="hive-task-panel-content"></div>
      `;
      document.body.appendChild(panel);
    }

    const content = document.getElementById('hive-task-panel-content');
    if (!content) return;

    const priority = (task.priority || 'normal').toLowerCase();
    const status = (task.status || 'plan').toLowerCase();
    const projectName = task.project_name || task.project?.name || 'Unknown Project';

    const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
    const subtaskStatusStyles = {
      done: 'bg-green-600/20 text-green-300 border-green-500/40',
      running: 'bg-blue-600/20 text-blue-300 border-blue-500/40 animate-pulse',
      failed: 'bg-red-600/20 text-red-300 border-red-500/40',
      plan: 'bg-slate-800 text-slate-300 border-slate-700'
    };
    const subtaskStageStyles = {
      plan: 'bg-slate-800 text-slate-300 border-slate-700',
      implement: 'bg-blue-900/30 text-blue-200 border-blue-700/50',
      verify: 'bg-amber-900/20 text-amber-200 border-amber-700/40',
      test: 'bg-purple-900/20 text-purple-200 border-purple-700/40',
      deploy: 'bg-cyan-900/20 text-cyan-200 border-cyan-700/40',
      done: 'bg-emerald-900/20 text-emerald-200 border-emerald-700/40'
    };
    const hasSubtasks = subtasks.length > 0;
    const completedSubtasks = subtasks.filter(subtask => ['done', 'completed', 'complete'].includes((subtask.status || subtask.stage || '').toLowerCase())).length;
    const progressPercent = hasSubtasks ? Math.min(100, Math.round((completedSubtasks / subtasks.length) * 100)) : 0;
    const subtasksSection = hasSubtasks ? `
      <div class="flex flex-col gap-2">
        ${subtasks.map(subtask => {
          const rawStatus = (subtask.status || '').toLowerCase();
          const rawStage = (subtask.stage || '').toLowerCase();
          const normalized = ['done', 'running', 'failed'].includes(rawStatus)
            ? rawStatus
            : (rawStage === 'done' ? 'done' : rawStage === 'running' ? 'running' : rawStage === 'failed' ? 'failed' : 'plan');
          const statusLabel = normalized.charAt(0).toUpperCase() + normalized.slice(1);
          const stageLabel = (subtask.stage || 'plan').toString();
          const statusClass = subtaskStatusStyles[normalized] || subtaskStatusStyles.plan;
          const stageClass = subtaskStageStyles[rawStage] || subtaskStageStyles.plan;
          return `
            <div class="flex items-center justify-between gap-2 bg-slate-950/40 border border-slate-800 rounded-lg px-3 py-2 text-xs">
              <span class="text-slate-200">${subtask.title || 'Untitled'}</span>
              <div class="flex items-center gap-2">
                <span class="px-2 py-0.5 rounded-full border ${stageClass}">${stageLabel}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    ` : '';

    content.innerHTML = `
      <div class="p-6">
        <div class="flex items-start justify-between mb-4">
          <div>
            <h3 class="text-xl font-bold text-white">${task.title || 'Task Detail'}</h3>
            <p class="text-slate-400 text-sm">${projectName}</p>
          </div>
          <button onclick="closeHivePanel()" class="text-slate-400 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button>
        </div>

        <div class="flex flex-wrap gap-2 mb-6">
          <span class="px-2 py-1 text-xs rounded-full bg-slate-800 text-slate-300">Priority: ${priority}</span>
          <span class="px-2 py-1 text-xs rounded-full bg-slate-800 text-slate-300">Status: ${status}</span>
          <span class="px-2 py-1 text-xs rounded-full bg-slate-800 text-slate-300">Stage: ${task.stage || 'plan'}</span>
        </div>

        <div class="mb-6">
          <h4 class="text-sm font-semibold text-slate-200 mb-2">Spec</h4>
          <pre class="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-300 whitespace-pre-wrap">${task.spec || 'No spec provided.'}</pre>
        </div>

        ${task.linked_from_id || task.linked_from?.id ? `
          <div class="mb-6">
            <h4 class="text-sm font-semibold text-slate-200 mb-2">Iteration</h4>
            <button class="text-xs text-blue-400 hover:text-blue-300" onclick="showTaskDetail(${task.linked_from_id || task.linked_from?.id})">Iteration of: ${task.linked_from_title || task.linked_from?.title || 'Original Task'}</button>
          </div>
        ` : ''}

        ${hasSubtasks ? `
          <div class="mb-6">
            <h4 class="text-sm font-semibold text-slate-200 mb-2">Subtask Progress</h4>
            <div class="w-full h-2 bg-slate-800 rounded-full">
              <div class="h-2 bg-blue-500 rounded-full" style="width: ${progressPercent}%"></div>
            </div>
            <div class="text-xs text-slate-400 mt-2">${completedSubtasks}/${subtasks.length} subtasks complete</div>
            <div class="mt-3">
              ${subtasksSection}
            </div>
          </div>
        ` : subtasksSection}

        ${hasSubtasks || status === 'plan' ? '' : `
          <div class="mb-6">
            <h4 class="text-sm font-semibold text-slate-200 mb-3">Pipeline Timeline</h4>
            ${this.renderTimeline(task)}
          </div>

          <div class="mb-6">
            <h4 class="text-sm font-semibold text-slate-200 mb-3">Step Logs</h4>
            ${this.renderStepLogs(task)}
          </div>
        `}

        <div class="flex flex-wrap gap-2">
          ${task.stage === 'plan' && !task.greenlit ? `<button onclick="greenlightTask(${task.id})" class="px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-medium">Green-light</button>` : ''}
          ${task.stage === 'plan' && task.greenlit ? `<span class="px-3 py-2 bg-emerald-600/30 text-emerald-300 rounded-lg text-xs font-medium">✓ Greenlit</span>` : ''}
          ${status === 'running' ? `<button onclick="pauseTask(${task.id})" class="px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-medium">Pause</button>` : ''}
          ${status === 'failed' ? `<button onclick="retryTask(${task.id})" class="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium">Retry</button>` : ''}
          <button onclick="showEditTaskModal(${task.id})" class="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-medium">Edit</button>
          <button onclick="deleteTask(${task.id})" class="px-3 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-300 rounded-lg text-xs font-medium">Delete</button>
        </div>
      </div>
    `;

    panel.classList.remove('hidden');
    setTimeout(() => {
      content.classList.remove('translate-x-full');
      content.classList.add('translate-x-0');
    }, 50);

    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  },

  renderTimeline(task) {
    const steps = ['plan', 'implement', 'verify', 'test', 'deploy'];
    const runs = task.pipeline_runs || [];
    const stageIndex = steps.indexOf((task.stage || 'plan').toLowerCase());
    const failedStage = runs.find(run => run.status === 'failed')?.stage;

    const pill = steps.map((step, index) => {
      let status = 'pending';
      if (failedStage === step) status = 'failed';
      else if (index < stageIndex) status = 'done';
      else if (index === stageIndex && task.status === 'running') status = 'running';
      else if (task.status === 'done' && index <= stageIndex) status = 'done';

      const duration = runs.find(run => run.stage === step)?.duration_ms;
      const durationText = duration ? `${Math.round(duration / 1000)}s` : '';

      const styles = {
        done: 'bg-green-600/20 text-green-300 border-green-500/40',
        running: 'bg-blue-600/20 text-blue-300 border-blue-500/40 animate-pulse',
        failed: 'bg-red-600/20 text-red-300 border-red-500/40',
        pending: 'bg-slate-800 text-slate-400 border-slate-700'
      };

      const symbol = status === 'done' ? '✓' : status === 'running' ? '●' : status === 'failed' ? '✕' : '○';

      return `
        <div class="flex items-center gap-2">
          <div class="px-3 py-1 rounded-full border text-xs font-medium ${styles[status]}">
            ${step.charAt(0).toUpperCase() + step.slice(1)} ${symbol}
          </div>
          ${durationText ? `<span class="text-xs text-slate-500">${durationText}</span>` : ''}
        </div>
      `;
    });

    return `<div class="flex flex-col gap-2">${pill.join('')}</div>`;
  },

  renderStepLogs(task) {
    const runs = task.pipeline_runs || [];
    if (!runs.length) {
      return '<div class="text-xs text-slate-500">No step logs yet.</div>';
    }

    return runs.map(run => {
      const logs = run.step_logs || [];
      const output = run.output || run.error || '';
      return `
        <details class="bg-slate-950 border border-slate-800 rounded-lg p-3 mb-2">
          <summary class="cursor-pointer text-sm text-slate-300">${run.stage.toUpperCase()} — ${run.status}</summary>
          <div class="mt-3 space-y-2">
            ${output ? `<pre class="text-xs text-slate-400 whitespace-pre-wrap">${output}</pre>` : ''}
            ${logs.map(log => `<div class="text-xs text-slate-500">[${log.timestamp || ''}] ${log.message}</div>`).join('')}
          </div>
        </details>
      `;
    }).join('');
  },

  closePanel() {
    const panel = document.getElementById('hive-task-panel');
    const content = document.getElementById('hive-task-panel-content');
    if (!panel || !content) return;
    content.classList.add('translate-x-full');
    setTimeout(() => {
      panel.remove();
    }, 300);
  },

  async showNewTaskModal(parentId) {
    const projects = await this.fetchProjects();
    const modal = document.createElement('div');
    modal.id = 'hive-task-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
      <div class="absolute inset-0 bg-black/50" onclick="closeHiveModal()"></div>
      <div class="relative bg-slate-800 rounded-lg border border-slate-700 w-full max-w-lg p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold text-white">New Task</h3>
          <button onclick="closeHiveModal()" class="text-slate-400 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button>
        </div>
        <div class="space-y-4">
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="text-sm text-slate-300">Project</label>
              <button onclick="showNewProjectModal()" class="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                <i data-lucide="plus" class="w-3 h-3"></i> Add Project
              </button>
            </div>
            <select id="hive-task-project" class="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200">
              ${projects.map(project => `<option value="${project.id}">${project.name}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-sm text-slate-300 mb-1">Title</label>
            <input id="hive-task-title" class="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200" placeholder="Task title" />
          </div>
          <div>
            <label class="block text-sm text-slate-300 mb-1">Spec</label>
            <textarea id="hive-task-spec" rows="6" class="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200" placeholder="Acceptance criteria..."></textarea>
          </div>
          <div>
            <label class="block text-sm text-slate-300 mb-1">Priority</label>
            <select id="hive-task-priority" class="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200">
              <option value="low">Low</option>
              <option value="normal" selected>Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div id="hive-task-type-wrap">
            <label class="block text-sm text-slate-300 mb-1">Task Type</label>
            <select id="hive-task-type" class="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200">
              <option value="code" selected>Code</option>
              <option value="creative">Creative</option>
            </select>
          </div>
        </div>
        <div class="flex gap-2 mt-6">
          <button onclick="createTask()" class="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium">Create Task</button>
          <button onclick="closeHiveModal()" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const selectedProject = window.projects.selectedProject;
    const projectSelect = document.getElementById('hive-task-project');
    if (projectSelect) {
      if (selectedProject && selectedProject !== 'all') {
        projectSelect.value = selectedProject;
      } else {
        const generalOption = Array.from(projectSelect.options).find(option => option.textContent?.trim() === 'General');
        if (generalOption) {
          projectSelect.value = generalOption.value;
        } else if (projectSelect.options.length) {
          projectSelect.value = projectSelect.options[0].value;
        }
      }
    }

    const taskTypeWrap = document.getElementById('hive-task-type-wrap');
    if (taskTypeWrap && parentId) {
      taskTypeWrap.classList.add('hidden');
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
  },

  async showNewProjectModal() {
    const modal = document.createElement('div');
    modal.id = 'hive-project-modal';
    modal.className = 'fixed inset-0 z-[60] flex items-center justify-center p-4';
    modal.innerHTML = `
      <div class="absolute inset-0 bg-black/50" onclick="document.getElementById('hive-project-modal')?.remove()"></div>
      <div class="relative bg-slate-800 rounded-lg border border-slate-700 w-full max-w-lg p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold text-white">New Project</h3>
          <button onclick="document.getElementById('hive-project-modal')?.remove()" class="text-slate-400 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button>
        </div>
        <div class="space-y-4">
          <div>
            <label class="block text-sm text-slate-300 mb-1">Name</label>
            <input id="hive-project-name" class="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200" placeholder="Project name" />
          </div>
          <div>
            <label class="block text-sm text-slate-300 mb-1">Description</label>
            <textarea id="hive-project-description" rows="4" class="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200" placeholder="Project description"></textarea>
          </div>
          <div>
            <label class="block text-sm text-slate-300 mb-1">Repo Path</label>
            <input id="hive-project-repo" class="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200" placeholder="/root/.openclaw/workspace/projects/..." />
          </div>
        </div>
        <div class="flex gap-2 mt-6">
          <button onclick="createProject()" class="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium">Create Project</button>
          <button onclick="document.getElementById('hive-project-modal')?.remove()" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  },

  showFeedbackModal(taskId) {
    const modal = document.createElement('div');
    modal.id = 'hive-feedback-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
      <div class="absolute inset-0 bg-black/50" onclick="closeHiveModal()"></div>
      <div class="relative bg-slate-800 rounded-lg border border-slate-700 w-full max-w-lg p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold text-white">Send Feedback</h3>
          <button onclick="closeHiveModal()" class="text-slate-400 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button>
        </div>
        <p class="text-sm text-slate-400 mb-4">This will archive the current task and create a new iteration with your feedback.</p>
        <textarea id="hive-feedback-text" rows="6" class="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200" placeholder="Your feedback..."></textarea>
        <div class="flex gap-2 mt-6">
          <button onclick="submitFeedback(${taskId})" class="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium">Submit Feedback</button>
          <button onclick="closeHiveModal()" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  },

  async fetchProjects() {
    try {
      const res = await fetch('/api/hive/projects');
      const data = await res.json();
      this.projectCache = data.projects || data || [];
      return this.projectCache;
    } catch (err) {
      console.error('Failed to load projects:', err);
      this.showToast('Failed to load projects', 'error');
      return [];
    }
  },

  async createTask(data) {
    try {
      console.log('[Hive] Creating task:', JSON.stringify(data));
      const res = await fetch('/api/hive/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await res.json().catch(() => null);
      console.log('[Hive] Create task response:', res.status, result);
      if (!res.ok) {
        this.showToast(result?.error || 'Failed to create task', 'error');
        return;
      }
      this.showToast('Task created', 'success');
      this.loadHiveDashboard();
    } catch (err) {
      console.error('Failed to create task:', err);
      this.showToast('Failed to create task', 'error');
    }
  },

  async createProject(data, { skipDashboardReload } = {}) {
    try {
      const res = await fetch('/api/hive/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const created = await res.json().catch(() => null);
      if (!res.ok) {
        const message = created?.error || 'Failed to create project';
        this.showToast(message, 'error');
        return null;
      }
      this.showToast('Project created', 'success');
      await this.fetchProjects();
      if (!skipDashboardReload) this.loadHiveDashboard();
      return created;
    } catch (err) {
      console.error('Failed to create project:', err);
      this.showToast('Failed to create project', 'error');
      return null;
    }
  },

  async greenlightTask(taskId) {
    try {
      const res = await fetch(`/api/hive/tasks/${taskId}/greenlight`, { method: 'POST' });
      const result = await res.json().catch(() => null);
      if (!res.ok) {
        this.showToast(result?.error || 'Failed to greenlight task', 'error');
        return;
      }
      this.showToast('Task greenlit', 'success');
      this.loadHiveDashboard();
    } catch (err) {
      console.error('Failed to greenlight task:', err);
      this.showToast('Failed to greenlight task', 'error');
    }
  },

  async pauseTask(taskId) {
    try {
      await fetch(`/api/hive/tasks/${taskId}/pause`, { method: 'POST' });
      this.showToast('Task paused', 'warning');
      this.loadHiveDashboard();
    } catch (err) {
      console.error('Failed to pause task:', err);
      this.showToast('Failed to pause task', 'error');
    }
  },

  async retryTask(taskId) {
    try {
      await fetch(`/api/hive/tasks/${taskId}/retry`, { method: 'POST' });
      this.showToast('Retry started', 'info');
      this.loadHiveDashboard();
    } catch (err) {
      console.error('Failed to retry task:', err);
      this.showToast('Failed to retry task', 'error');
    }
  },

  async deleteTask(taskId) {
    if (!confirm('Delete this task?')) return;
    try {
      await fetch(`/api/hive/tasks/${taskId}`, { method: 'DELETE' });
      this.showToast('Task deleted', 'warning');
      this.loadHiveDashboard();
      this.closePanel();
    } catch (err) {
      console.error('Failed to delete task:', err);
      this.showToast('Failed to delete task', 'error');
    }
  },

  async showEditTaskModal(taskId) {
    try {
      const res = await fetch(`/api/hive/tasks/${taskId}`);
      const task = await res.json();
      await this.showNewTaskModal();
      document.getElementById('hive-task-title').value = task.title || '';
      document.getElementById('hive-task-spec').value = task.spec || '';
      document.getElementById('hive-task-priority').value = task.priority || 'normal';
      document.getElementById('hive-task-project').value = task.project_id || '';

      const createBtn = document.querySelector('#hive-task-modal button[onclick="createTask()"]');
      if (createBtn) {
        createBtn.textContent = 'Save Changes';
        createBtn.onclick = () => updateTask(taskId);
      }
    } catch (err) {
      console.error('Failed to edit task:', err);
      this.showToast('Failed to load task', 'error');
    }
  },

  async updateTask(taskId, data) {
    try {
      await fetch(`/api/hive/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      this.showToast('Task updated', 'success');
      this.loadHiveDashboard();
    } catch (err) {
      console.error('Failed to update task:', err);
      this.showToast('Failed to update task', 'error');
    }
  },

  async archiveTask(taskId) {
    if (!confirm('Archive this task?')) return;
    try {
      await fetch(`/api/hive/tasks/${taskId}/archive`, { method: 'POST' });
      this.showToast('Task archived', 'info');
      this.loadHiveDashboard();
    } catch (err) {
      this.showToast('Failed to archive', 'error');
    }
  },

  async submitFeedback(taskId) {
    const feedback = document.getElementById('hive-feedback-text')?.value || '';
    try {
      await fetch(`/api/hive/tasks/${taskId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback_text: feedback })
      });
      this.showToast('Feedback task created', 'success');
      closeHiveModal();
      this.loadHiveDashboard();
    } catch (err) {
      this.showToast('Failed to submit feedback', 'error');
    }
  }
};

window.loadHiveDashboard = () => window.projects.loadHiveDashboard();
window.filterHiveProject = (projectId) => {
  window.projects.selectedProject = projectId;
  window.projects.renderProjectTabs();
  window.projects.renderKanban();
};
window.showTaskDetail = (taskId) => window.projects.showTaskDetail(taskId);
window.greenlightTask = (taskId) => window.projects.greenlightTask(taskId);
window.pauseTask = (taskId) => window.projects.pauseTask(taskId);
window.retryTask = (taskId) => window.projects.retryTask(taskId);
window.showNewTaskModal = (parentId) => window.projects.showNewTaskModal(parentId);
window.showNewProjectModal = () => window.projects.showNewProjectModal();
window.createTask = () => {
  const data = {
    project_id: document.getElementById('hive-task-project')?.value,
    title: document.getElementById('hive-task-title')?.value,
    spec: document.getElementById('hive-task-spec')?.value,
    priority: document.getElementById('hive-task-priority')?.value,
    task_type: document.getElementById('hive-task-type')?.value
  };
  if (data.parent_id) delete data.task_type;
  window.projects.createTask(data);
  closeHiveModal();
};
window.createProject = async () => {
  const data = {
    name: document.getElementById('hive-project-name')?.value,
    description: document.getElementById('hive-project-description')?.value,
    repo_path: document.getElementById('hive-project-repo')?.value
  };
  const taskModalOpen = !!document.getElementById('hive-task-modal');
  const created = await window.projects.createProject(data, { skipDashboardReload: taskModalOpen });
  if (!created) return;

  const projectModal = document.getElementById('hive-project-modal');
  if (projectModal) projectModal.remove();

  const taskModal = document.getElementById('hive-task-modal');
  const projectSelect = document.getElementById('hive-task-project');
  if (taskModal && projectSelect) {
    const titleValue = document.getElementById('hive-task-title')?.value || '';
    const specValue = document.getElementById('hive-task-spec')?.value || '';
    const priorityValue = document.getElementById('hive-task-priority')?.value || 'normal';

    const projects = window.projects.projectCache || [];
    projectSelect.innerHTML = projects.map(project => `<option value="${project.id}">${project.name}</option>`).join('');

    let newProjectId = created?.id || created?.project_id || created?.project?.id;
    if (!newProjectId && data.name) {
      const match = projects.find(project => project.name === data.name);
      newProjectId = match?.id;
    }
    if (newProjectId) {
      projectSelect.value = String(newProjectId);
    }

    const titleInput = document.getElementById('hive-task-title');
    const specInput = document.getElementById('hive-task-spec');
    const priorityInput = document.getElementById('hive-task-priority');
    if (titleInput) titleInput.value = titleValue;
    if (specInput) specInput.value = specValue;
    if (priorityInput) priorityInput.value = priorityValue;
  }
};
window.updateTask = (taskId) => {
  const data = {
    project_id: document.getElementById('hive-task-project')?.value,
    title: document.getElementById('hive-task-title')?.value,
    spec: document.getElementById('hive-task-spec')?.value,
    priority: document.getElementById('hive-task-priority')?.value
  };
  window.projects.updateTask(taskId, data);
  closeHiveModal();
};
window.deleteTask = (taskId) => window.projects.deleteTask(taskId);
window.deleteProject = async (projectId) => {
  if (!confirm('Delete this project? Tasks under it must be removed first.')) return;
  try {
    const res = await fetch(`/api/hive/projects/${projectId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.error) { window.projects.showToast(data.error, 'error'); return; }
    window.projects.showToast('Project deleted', 'warning');
    window.projects.loadHiveDashboard();
  } catch (err) {
    window.projects.showToast('Failed to delete project', 'error');
  }
};
window.closeHivePanel = () => window.projects.closePanel();
window.closeHiveModal = () => {
  const modal = document.getElementById('hive-task-modal') || document.getElementById('hive-project-modal') || document.getElementById('hive-feedback-modal');
  if (modal) modal.remove();
};
window.showEditTaskModal = (taskId) => window.projects.showEditTaskModal(taskId);
window.archiveTask = (taskId) => window.projects.archiveTask(taskId);
window.toggleArchive = () => {
  const container = document.getElementById('archiveContainer');
  const chevron = document.getElementById('archiveChevron');
  if (!container || !chevron) return;
  container.classList.toggle('hidden');
  window.projects.archiveOpen = !container.classList.contains('hidden');
  chevron.style.transform = window.projects.archiveOpen ? 'rotate(180deg)' : '';
};
window.showFeedbackModal = (taskId) => window.projects.showFeedbackModal(taskId);
window.submitFeedback = (taskId) => window.projects.submitFeedback(taskId);
