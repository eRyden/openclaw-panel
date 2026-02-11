// Chart.js Helpers and Configuration

window.charts = {
  cpu: null,
  ram: null,
  cost: null,
  model: null,
  token: null,
  
  // Chart.js defaults
  defaults: {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        labels: {
          color: '#94a3b8'
        }
      }
    },
    scales: {
      x: {
        ticks: { color: '#64748b' },
        grid: { color: '#1e293b' }
      },
      y: {
        ticks: { color: '#64748b' },
        grid: { color: '#1e293b' }
      }
    }
  },
  
  // Create CPU chart
  createCpuChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    
    if (this.cpu) {
      this.cpu.destroy();
    }
    
    this.cpu = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.labels || [],
        datasets: [{
          label: 'CPU %',
          data: data.values || [],
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        ...this.defaults,
        scales: {
          x: {
            ticks: { color: '#64748b' },
            grid: { color: '#1e293b' }
          },
          y: {
            min: 0,
            max: 100,
            ticks: { color: '#64748b', callback: (value) => value + '%' },
            grid: { color: '#1e293b' }
          }
        }
      }
    });
    
    return this.cpu;
  },
  
  // Create RAM chart
  createRamChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    
    if (this.ram) {
      this.ram.destroy();
    }
    
    this.ram = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.labels || [],
        datasets: [{
          label: 'RAM %',
          data: data.values || [],
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        ...this.defaults,
        scales: {
          x: {
            ticks: { color: '#64748b' },
            grid: { color: '#1e293b' }
          },
          y: {
            min: 0,
            max: 100,
            ticks: { color: '#64748b', callback: (value) => value + '%' },
            grid: { color: '#1e293b' }
          }
        }
      }
    });
    
    return this.ram;
  },
  
  // Create cost over time chart
  createCostChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    
    if (this.cost) {
      this.cost.destroy();
    }
    
    this.cost = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.labels || [],
        datasets: data.datasets || []
      },
      options: {
        ...this.defaults,
        scales: {
          x: {
            stacked: true,
            ticks: { color: '#64748b' },
            grid: { color: '#1e293b' }
          },
          y: {
            stacked: true,
            ticks: { 
              color: '#64748b',
              callback: (value) => '$' + value.toFixed(2)
            },
            grid: { color: '#1e293b' }
          }
        }
      }
    });
    
    return this.cost;
  },
  
  // Create model breakdown chart
  createModelChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    
    if (this.model) {
      this.model.destroy();
    }
    
    this.model = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: data.labels || [],
        datasets: [{
          data: data.values || [],
          backgroundColor: [
            '#8b5cf6', // Opus - purple
            '#3b82f6', // Sonnet - blue
            '#22c55e', // Haiku - green
            '#f59e0b', // Codex - orange
            '#ec4899', // Gemini - pink
            '#06b6d4', // Other - cyan
            '#84cc16', // More - lime
            '#f97316'  // Extra - orange
          ],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: {
              color: '#94a3b8',
              padding: 10,
              font: {
                size: 12
              },
              boxWidth: 14,
              boxHeight: 14,
              usePointStyle: true,
              pointStyle: 'circle'
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.label || '';
                const value = context.parsed || 0;
                return `${label}: $${value.toFixed(2)}`;
              }
            }
          }
        }
      }
    });
    
    return this.model;
  },
  
  // Create token usage chart
  createTokenChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    
    if (this.token) {
      this.token.destroy();
    }
    
    this.token = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.labels || [],
        datasets: [
          {
            label: 'Input Tokens',
            data: data.input || [],
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.4
          },
          {
            label: 'Output Tokens',
            data: data.output || [],
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.4
          }
        ]
      },
      options: {
        ...this.defaults,
        scales: {
          x: {
            ticks: { color: '#64748b' },
            grid: { color: '#1e293b' }
          },
          y: {
            ticks: { 
              color: '#64748b',
              callback: (value) => (value / 1000).toFixed(0) + 'K'
            },
            grid: { color: '#1e293b' }
          }
        }
      }
    });
    
    return this.token;
  },
  
  // Update chart data
  updateChart(chart, newData) {
    if (!chart) return;
    
    if (newData.labels) {
      chart.data.labels = newData.labels;
    }
    
    if (newData.datasets) {
      chart.data.datasets = newData.datasets;
    } else if (newData.values && chart.data.datasets[0]) {
      chart.data.datasets[0].data = newData.values;
    }
    
    chart.update('none'); // Update without animation for real-time data
  }
};
