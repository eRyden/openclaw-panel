// Projects Page Logic

window.projects = {
  data: { projects: {} },
  currentProject: 'general',
  
  // Icon mapping for project icons (emoji -> lucide name)
  projectIconMap: {
    '📋': 'clipboard-list',
    '📈': 'trending-up',
    '⚔️': 'swords',
    '📁': 'folder',
    '🎮': 'gamepad-2',
    '🔧': 'wrench',
    '💡': 'lightbulb',
    '🚀': 'rocket'
  },
  
  async load() {
    try {
      const res = await fetch('/api/tasks');
      this.data = await res.json();
      this.render();
    } catch (err) {
      console.error('Failed to load projects:', err);
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
      } else {
        alert('Failed to move task: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Failed to move task: ' + err.message);
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
      } else {
        alert('Failed to delete task: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Failed to delete task: ' + err.message);
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
