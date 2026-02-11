// Projects Page Logic

window.projects = {
  data: { projects: {} },
  currentProject: 'general',
  selectedColor: '#3b82f6',
  
  // Icon mapping for project icons (emoji -> lucide name)
  projectIconMap: {
    '📋': 'clipboard-list',
    '📈': 'trending-up',
    '⚔️': 'swords',
    '📁': 'folder',
    '🎮': 'gamepad-2',
    '🔧': 'wrench',
    '💡': 'lightbulb',
    '🚀': 'rocket',
    '💻': 'code',
    '📚': 'book',
    '🛡️': 'shield',
    '⚡': 'zap'
  },
  
  // Toast notification system
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
    
    toast.className = `${bgColors[type]} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 min-w-[300px] max-w-md animate-slide-in`;
    toast.innerHTML = `
      <i data-lucide="${icons[type]}" class="w-5 h-5 flex-shrink-0"></i>
      <span class="flex-1">${message}</span>
      <button onclick="this.parentElement.remove()" class="text-white/80 hover:text-white">
        <i data-lucide="x" class="w-4 h-4"></i>
      </button>
    `;
    
    container.appendChild(toast);
    
    // Refresh icons
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(400px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  },
  
  async load() {
    try {
      const res = await fetch('/api/tasks');
      this.data = await res.json();
      this.render();
    } catch (err) {
      console.error('Failed to load projects:', err);
      this.showToast('Failed to load projects', 'error');
    }
  },
  
  // Modal Management - Dynamic modal creation
  showAddProjectModal() {
    // Create modal dynamically
    const modal = document.createElement('div');
    modal.id = 'project-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    
    modal.innerHTML = `
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-black/50" onclick="window.projects.closeModal()"></div>
      
      <!-- Modal Content -->
      <div class="relative bg-slate-800 rounded-lg border border-slate-700 w-full max-w-md p-6">
        <div class="flex items-center justify-between mb-6">
          <h3 class="text-xl font-bold text-white">Add New Project</h3>
          <button onclick="window.projects.closeModal()" class="text-slate-400 hover:text-white">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>
        
        <div class="mb-4">
          <label class="block text-sm font-medium text-slate-300 mb-2">Project Name *</label>
          <input type="text" 
                 id="project-name-input" 
                 required 
                 placeholder="My Awesome Project"
                 class="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500">
        </div>
        
        <!-- Icon Selection -->
        <div class="mb-4">
          <label class="block text-sm font-medium text-slate-300 mb-2">Icon</label>
          <select id="project-icon-input" class="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500">
            <option value="clipboard-list">📋 Clipboard List</option>
            <option value="trending-up">📈 Trending Up</option>
            <option value="swords">⚔️ Swords</option>
            <option value="folder" selected>📁 Folder</option>
            <option value="gamepad-2">🎮 Gamepad</option>
            <option value="wrench">🔧 Wrench</option>
            <option value="lightbulb">💡 Lightbulb</option>
            <option value="rocket">🚀 Rocket</option>
            <option value="code">💻 Code</option>
            <option value="book">📚 Book</option>
            <option value="shield">🛡️ Shield</option>
            <option value="zap">⚡ Zap</option>
          </select>
        </div>
        
        <!-- Color Selection -->
        <div class="mb-6">
          <label class="block text-sm font-medium text-slate-300 mb-2">Color</label>
          <div id="project-color-swatches" class="flex gap-2 flex-wrap">
            <button type="button" class="color-swatch w-10 h-10 rounded-lg bg-blue-500 border-2 border-white transition-colors" data-color="#3b82f6"></button>
            <button type="button" class="color-swatch w-10 h-10 rounded-lg bg-green-500 border-2 border-transparent hover:border-white transition-colors" data-color="#10b981"></button>
            <button type="button" class="color-swatch w-10 h-10 rounded-lg bg-amber-500 border-2 border-transparent hover:border-white transition-colors" data-color="#f59e0b"></button>
            <button type="button" class="color-swatch w-10 h-10 rounded-lg bg-red-500 border-2 border-transparent hover:border-white transition-colors" data-color="#ef4444"></button>
            <button type="button" class="color-swatch w-10 h-10 rounded-lg bg-violet-500 border-2 border-transparent hover:border-white transition-colors" data-color="#8b5cf6"></button>
            <button type="button" class="color-swatch w-10 h-10 rounded-lg bg-pink-500 border-2 border-transparent hover:border-white transition-colors" data-color="#ec4899"></button>
            <button type="button" class="color-swatch w-10 h-10 rounded-lg bg-cyan-500 border-2 border-transparent hover:border-white transition-colors" data-color="#06b6d4"></button>
            <button type="button" class="color-swatch w-10 h-10 rounded-lg bg-slate-500 border-2 border-transparent hover:border-white transition-colors" data-color="#64748b"></button>
          </div>
          <input type="hidden" id="project-color-input" value="#3b82f6">
        </div>
        
        <!-- Action Buttons -->
        <div class="flex gap-3">
          <button type="button" onclick="window.projects.submitProject()" class="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors">
            Create Project
          </button>
          <button type="button" onclick="window.projects.closeModal()" class="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg font-medium hover:bg-slate-600 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
    
    // Set up color swatch selection
    this.selectedColor = '#3b82f6';
    document.querySelectorAll('.color-swatch').forEach(swatch => {
      swatch.addEventListener('click', () => {
        const color = swatch.dataset.color;
        this.selectedColor = color;
        document.getElementById('project-color-input').value = color;
        
        // Update visual selection
        document.querySelectorAll('.color-swatch').forEach(s => {
          s.classList.remove('border-white');
          s.classList.add('border-transparent');
        });
        swatch.classList.remove('border-transparent');
        swatch.classList.add('border-white');
      });
    });
  },
  
  showAddTaskModal() {
    // Create modal dynamically
    const modal = document.createElement('div');
    modal.id = 'task-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    
    modal.innerHTML = `
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-black/50" onclick="window.projects.closeModal()"></div>
      
      <!-- Modal Content -->
      <div class="relative bg-slate-800 rounded-lg border border-slate-700 w-full max-w-md p-6">
        <div class="flex items-center justify-between mb-6">
          <h3 class="text-xl font-bold text-white">Add New Task</h3>
          <button onclick="window.projects.closeModal()" class="text-slate-400 hover:text-white">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>
        
        <!-- Task Title -->
        <div class="mb-4">
          <label class="block text-sm font-medium text-slate-300 mb-2">Title *</label>
          <input type="text" 
                 id="task-title-input" 
                 required 
                 placeholder="Task title"
                 class="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500">
        </div>
        
        <!-- Task Description -->
        <div class="mb-4">
          <label class="block text-sm font-medium text-slate-300 mb-2">Description</label>
          <textarea id="task-description-input" 
                    rows="3"
                    placeholder="Optional description"
                    class="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"></textarea>
        </div>
        
        <!-- Priority -->
        <div class="mb-4">
          <label class="block text-sm font-medium text-slate-300 mb-2">Priority</label>
          <select id="task-priority-input" class="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500">
            <option value="high">High</option>
            <option value="medium" selected>Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        
        <!-- Assignee -->
        <div class="mb-6">
          <label class="block text-sm font-medium text-slate-300 mb-2">Assignee</label>
          <select id="task-assignee-input" class="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500">
            <option value="atom">Atom</option>
            <option value="erik">Erik</option>
          </select>
        </div>
        
        <!-- Action Buttons -->
        <div class="flex gap-3">
          <button type="button" onclick="window.projects.submitTask()" class="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors">
            Create Task
          </button>
          <button type="button" onclick="window.projects.closeModal()" class="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg font-medium hover:bg-slate-600 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  },
  
  closeModal() {
    // Remove both possible modals
    const projectModal = document.getElementById('project-modal');
    const taskModal = document.getElementById('task-modal');
    
    if (projectModal) projectModal.remove();
    if (taskModal) taskModal.remove();
  },
  
  async submitProject() {
    const nameInput = document.getElementById('project-name-input');
    const name = nameInput ? nameInput.value.trim() : '';
    
    if (!name) {
      console.error('Project name is required');
      this.showToast('Project name is required', 'error');
      return;
    }
    
    // Generate ID from name (kebab-case)
    const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    
    const iconInput = document.getElementById('project-icon-input');
    const icon = iconInput ? iconInput.value : 'folder';
    
    const colorInput = document.getElementById('project-color-input');
    const color = colorInput ? colorInput.value : this.selectedColor;
    
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, icon, color })
      });
      
      const data = await res.json();
      
      if (data.success) {
        this.showToast('Project created successfully!', 'success');
        this.closeModal();
        await this.load();
        this.selectProject(id);
      } else {
        console.error('Failed to create project: ' + (data.error || 'Unknown error'));
        this.showToast('Failed to create project: ' + (data.error || 'Unknown error'), 'error');
      }
    } catch (err) {
      console.error('Failed to create project: ' + err.message);
      this.showToast('Failed to create project: ' + err.message, 'error');
    }
  },
  
  async submitTask() {
    const titleInput = document.getElementById('task-title-input');
    const title = titleInput ? titleInput.value.trim() : '';
    
    if (!title) {
      console.error('Task title is required');
      this.showToast('Task title is required', 'error');
      return;
    }
    
    const descInput = document.getElementById('task-description-input');
    const description = descInput ? descInput.value.trim() : '';
    
    const priorityInput = document.getElementById('task-priority-input');
    const priority = priorityInput ? priorityInput.value : 'medium';
    
    const assigneeInput = document.getElementById('task-assignee-input');
    const assignee = assigneeInput ? assigneeInput.value : 'atom';
    
    try {
      const res = await fetch(`/api/tasks/${this.currentProject}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          priority,
          assignee,
          status: 'todo'
        })
      });
      
      const data = await res.json();
      
      if (data.success) {
        this.showToast('Task created successfully!', 'success');
        this.closeModal();
        await this.load();
      } else {
        console.error('Failed to create task: ' + (data.error || 'Unknown error'));
        this.showToast('Failed to create task: ' + (data.error || 'Unknown error'), 'error');
      }
    } catch (err) {
      console.error('Failed to create task: ' + err.message);
      this.showToast('Failed to create task: ' + err.message, 'error');
    }
  },
  
  render() {
    this.renderProjectTabs();
    this.renderKanban();
    // Refresh Lucide icons after rendering
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  },
  
  getIconHtml(emoji, size = 'w-4 h-4') {
    const iconName = this.projectIconMap[emoji] || 'folder';
    return `<i data-lucide="${iconName}" class="${size}"></i>`;
  },
  
  renderProjectTabs() {
    const container = document.getElementById('project-tabs');
    
    const projects = Object.entries(this.data.projects);
    
    container.innerHTML = projects.map(([id, project]) => {
      const taskCount = (project.tasks || []).length;
      const isActive = id === this.currentProject;
      const iconHtml = this.getIconHtml(project.icon);
      
      return `
        <button class="px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2
                       ${isActive ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}"
                onclick="window.projects.selectProject('${id}')">
          ${iconHtml} ${project.name}
          <span class="ml-1 badge-secondary">${taskCount}</span>
        </button>
      `;
    }).join('');
  },
  
  selectProject(projectId) {
    this.currentProject = projectId;
    this.render();
  },
  
  renderKanban() {
    const project = this.data.projects[this.currentProject];
    if (!project) return;
    
    const tasks = project.tasks || [];
    
    // Group by status
    const todo = tasks.filter(t => t.status === 'todo');
    const inprogress = tasks.filter(t => t.status === 'inprogress');
    const done = tasks.filter(t => t.status === 'done');
    
    // Update counts
    document.getElementById('todo-count').textContent = todo.length;
    document.getElementById('inprogress-count').textContent = inprogress.length;
    document.getElementById('done-count').textContent = done.length;
    
    // Render columns
    this.renderColumn('todo-column', todo);
    this.renderColumn('inprogress-column', inprogress);
    this.renderColumn('done-column', done);
  },
  
  renderColumn(columnId, tasks) {
    const container = document.getElementById(columnId);
    
    if (tasks.length === 0) {
      container.innerHTML = '<div class="text-slate-500 text-center py-4 text-sm">No tasks</div>';
      return;
    }
    
    container.innerHTML = tasks
      .sort((a, b) => a.order - b.order)
      .map(task => this.renderTask(task))
      .join('');
  },
  
  renderTask(task) {
    const priorityColors = {
      high: 'text-red-400',
      medium: 'text-yellow-400',
      low: 'text-green-400'
    };
    
    const priorityIcons = {
      high: 'alert-circle',
      medium: 'minus-circle',
      low: 'check-circle'
    };
    
    const assigneeIcons = {
      atom: 'atom',
      erik: 'user'
    };
    
    return `
      <div class="kanban-card" data-task-id="${task.id}">
        <div class="flex items-start justify-between mb-2">
          <div class="flex items-center gap-2">
            <span class="${priorityColors[task.priority]}">
              <i data-lucide="${priorityIcons[task.priority]}" class="w-4 h-4"></i>
            </span>
            <span class="font-medium text-sm">${task.title}</span>
          </div>
          <span class="text-slate-400">
            <i data-lucide="${assigneeIcons[task.assignee]}" class="w-4 h-4"></i>
          </span>
        </div>
        
        ${task.description ? `
          <p class="text-xs text-slate-400 mb-2 line-clamp-2">${task.description}</p>
        ` : ''}
        
        <div class="flex items-center justify-between mt-2">
          <div class="text-xs text-slate-500">
            ${new Date(task.createdAt).toLocaleDateString()}
          </div>
          <button onclick="window.projects.deleteTask('${task.id}')" 
                  class="text-slate-500 hover:text-red-400 text-xs">
            Delete
          </button>
        </div>
      </div>
    `;
  },
  
  async moveTask(taskId, newStatus) {
    try {
      const res = await fetch(`/api/tasks/${this.currentProject}/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      
      const data = await res.json();
      
      if (data.success) {
        await this.load();
        this.showToast('Task moved successfully', 'success');
      } else {
        console.error('Failed to move task:', data.error);
        this.showToast('Failed to move task: ' + (data.error || 'Unknown error'), 'error');
      }
    } catch (err) {
      console.error('Failed to move task:', err);
      this.showToast('Failed to move task: ' + err.message, 'error');
    }
  },
  
  async deleteTask(taskId) {
    if (!confirm('Delete this task?')) return;
    
    try {
      const res = await fetch(`/api/tasks/${this.currentProject}/${taskId}`, {
        method: 'DELETE'
      });
      
      const data = await res.json();
      
      if (data.success) {
        await this.load();
        this.showToast('Task deleted successfully', 'success');
      } else {
        console.error('Failed to delete task:', data.error);
        this.showToast('Failed to delete task: ' + (data.error || 'Unknown error'), 'error');
      }
    } catch (err) {
      console.error('Failed to delete task:', err);
      this.showToast('Failed to delete task: ' + err.message, 'error');
    }
  }
};

// Add simple drag-and-drop support
document.addEventListener('DOMContentLoaded', () => {
  // This is a basic implementation - for production, consider using a library like SortableJS
  
  function initDragAndDrop() {
    const columns = ['todo-column', 'inprogress-column', 'done-column'];
    const statusMap = {
      'todo-column': 'todo',
      'inprogress-column': 'inprogress',
      'done-column': 'done'
    };
    
    columns.forEach(columnId => {
      const column = document.getElementById(columnId);
      if (!column) return;
      
      column.addEventListener('dragover', (e) => {
        e.preventDefault();
        column.classList.add('bg-slate-800');
      });
      
      column.addEventListener('dragleave', () => {
        column.classList.remove('bg-slate-800');
      });
      
      column.addEventListener('drop', (e) => {
        e.preventDefault();
        column.classList.remove('bg-slate-800');
        
        const taskId = e.dataTransfer.getData('text/plain');
        const newStatus = statusMap[columnId];
        
        if (taskId && newStatus && window.projects) {
          window.projects.moveTask(taskId, newStatus);
        }
      });
    });
    
    // Make cards draggable
    document.addEventListener('mousedown', (e) => {
      const card = e.target.closest('.kanban-card');
      if (card) {
        card.setAttribute('draggable', 'true');
        
        card.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', card.dataset.taskId);
          card.classList.add('opacity-50');
        });
        
        card.addEventListener('dragend', () => {
          card.classList.remove('opacity-50');
          card.setAttribute('draggable', 'false');
        });
      }
    });
  }
  
  // Re-init drag and drop when projects page loads
  const observer = new MutationObserver(() => {
    if (window.location.hash === '#projects' || window.appState?.currentPage === 'projects') {
      setTimeout(initDragAndDrop, 100);
    }
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
});
