// Atom Control Center - Main App Router & Shared Logic

// Global state
window.appState = {
  currentPage: 'dashboard',
  systemStatus: null,
  refreshInterval: null
};

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
  
  initRouter();
  initMobileMenu();
  loadSystemInfo();
  startAutoRefresh();
});

// Router
function initRouter() {
  // Handle hash navigation
  window.addEventListener('hashchange', handleRoute);
  
  // Handle nav link clicks
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const page = link.dataset.page;
      navigateTo(page);
    });
  });
  
  // Load initial page from hash or default to dashboard
  const hash = window.location.hash.slice(1);
  navigateTo(hash || 'dashboard');
}

function navigateTo(page) {
  // Update hash
  window.location.hash = page;
  
  // Update active page
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
  });
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) {
    pageEl.classList.add('active');
  }
  
  // Update active nav link
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.page === page);
  });
  
  // Update state
  window.appState.currentPage = page;
  
  // Load page data
  loadPageData(page);
  
  // Close mobile menu
  closeMobileMenu();
  
  // Re-render Lucide icons after page change
  setTimeout(() => {
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }, 50);
}

function handleRoute() {
  const page = window.location.hash.slice(1) || 'dashboard';
  navigateTo(page);
}

function loadPageData(page) {
  switch (page) {
    case 'dashboard':
      if (window.dashboard) window.dashboard.load();
      break;
    case 'usage':
      if (window.usage) window.usage.load();
      break;
    case 'logs':
      if (window.logs) window.logs.connect();
      break;
    case 'actions':
      if (window.actions) window.actions.load();
      break;
    case 'cron':
      if (window.cron) window.cron.load();
      break;
    case 'projects':
      if (window.projects) window.projects.load();
      break;
  }
}

// Mobile Menu
function initMobileMenu() {
  const toggle = document.getElementById('mobile-menu-toggle');
  const sidebar = document.getElementById('sidebar');
  
  if (toggle) {
    toggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }
  
  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!sidebar.contains(e.target) && e.target !== toggle && sidebar.classList.contains('open')) {
      closeMobileMenu();
    }
  });
}

function closeMobileMenu() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.remove('open');
}

// Load system info for sidebar
async function loadSystemInfo() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    window.appState.systemStatus = data;
    
    // Update sidebar version
    const versionEl = document.getElementById('sidebar-version');
    if (versionEl && data.version) {
      versionEl.textContent = data.version;
    }
    
    // Update sidebar gateway status
    updateSidebarGatewayStatus(data);
  } catch (err) {
    console.error('Failed to load system info:', err);
  }
}

// Update sidebar gateway status
function updateSidebarGatewayStatus(data) {
  const statusDot = document.getElementById('gateway-status-dot');
  const statusText = document.getElementById('gateway-status-text');
  const uptimeEl = document.getElementById('gateway-uptime');
  const versionEl = document.getElementById('gateway-version');
  
  const isRunning = data.gatewayStatus === 'running';
  
  if (statusDot) {
    statusDot.className = `w-2 h-2 rounded-full ${isRunning ? 'bg-green-500' : 'bg-red-500'}`;
  }
  
  if (statusText) {
    statusText.textContent = isRunning ? 'Gateway Running' : 'Gateway Stopped';
    statusText.className = `text-xs font-medium ${isRunning ? 'text-green-400' : 'text-red-400'}`;
  }
  
  if (uptimeEl) {
    uptimeEl.textContent = data.uptime || '-';
  }
  
  if (versionEl) {
    versionEl.textContent = data.version ? data.version.split(' ')[0] : '-';
  }
}

// Auto-refresh
function startAutoRefresh() {
  // Refresh current page every 30 seconds
  window.appState.refreshInterval = setInterval(() => {
    const page = window.appState.currentPage;
    if (page !== 'logs') { // Logs uses SSE, don't poll
      loadPageData(page);
    }
    // Also refresh sidebar gateway status
    loadSystemInfo();
  }, 30000);
}

// Helper to refresh Lucide icons (call after dynamic content updates)
window.refreshIcons = function() {
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
};

// Utility functions
window.utils = {
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 10) / 10 + ' ' + sizes[i];
  },
  
  formatDuration(ms) {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 100) / 10}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
    if (ms < 86400000) return `${Math.round(ms / 3600000)}h`;
    return `${Math.round(ms / 86400000)}d`;
  },
  
  formatTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  },
  
  formatCost(amount) {
    return '$' + amount.toFixed(2);
  }
};
