/**
 * Google Business Profile Auto-Poster Dashboard
 * Frontend JavaScript
 */

// Socket.IO connection
const socket = io();

// DOM Elements
const elements = {
  businessName: document.getElementById('businessName'),
  schedulerBadge: document.getElementById('schedulerBadge'),
  cronExpression: document.getElementById('cronExpression'),
  timezone: document.getElementById('timezone'),
  nextRun: document.getElementById('nextRun'),
  startBtn: document.getElementById('startBtn'),
  stopBtn: document.getElementById('stopBtn'),
  totalPosts: document.getElementById('totalPosts'),
  successPosts: document.getElementById('successPosts'),
  failedPosts: document.getElementById('failedPosts'),
  successRate: document.getElementById('successRate'),
  postText: document.getElementById('postText'),
  buttonUrl: document.getElementById('buttonUrl'),
  buttonText: document.getElementById('buttonText'),
  postNowBtn: document.getElementById('postNowBtn'),
  postingBadge: document.getElementById('postingBadge'),
  historyList: document.getElementById('historyList'),
  logList: document.getElementById('logList'),
  toastContainer: document.getElementById('toastContainer')
};

// =============================================================================
// Socket.IO Event Handlers
// =============================================================================

socket.on('connect', () => {
  addLog('Connected to server', 'success');
});

socket.on('disconnect', () => {
  addLog('Disconnected from server', 'error');
});

socket.on('status', (status) => {
  updateStatus(status);
});

socket.on('history-updated', (history) => {
  renderHistory(history);
});

socket.on('posting-started', ({ trigger }) => {
  addLog(`${trigger === 'scheduled' ? 'Scheduled' : 'Manual'} post started...`, 'info');
  elements.postingBadge.classList.remove('hidden');
  elements.postingBadge.classList.add('posting');
  elements.postNowBtn.disabled = true;
});

socket.on('posting-complete', ({ result, historyEntry }) => {
  elements.postingBadge.classList.add('hidden');
  elements.postNowBtn.disabled = false;

  if (result.success) {
    addLog(`Post successful: ${historyEntry.postText.substring(0, 50)}...`, 'success');
    showToast('Post published successfully!', 'success');
  } else {
    addLog(`Post failed: ${result.message}`, 'error');
    showToast(`Post failed: ${result.message}`, 'error');
  }
});

// =============================================================================
// UI Update Functions
// =============================================================================

function updateStatus(status) {
  // Business name
  elements.businessName.textContent = status.businessName || 'Business Profile';

  // Scheduler status
  if (status.schedulerRunning) {
    elements.schedulerBadge.textContent = 'Running';
    elements.schedulerBadge.className = 'status-badge running';
    elements.startBtn.disabled = true;
    elements.stopBtn.disabled = false;
  } else {
    elements.schedulerBadge.textContent = 'Stopped';
    elements.schedulerBadge.className = 'status-badge stopped';
    elements.startBtn.disabled = false;
    elements.stopBtn.disabled = true;
  }

  // Schedule info
  elements.cronExpression.textContent = status.cronExpression || '--';
  elements.timezone.textContent = status.timezone || '--';

  // Next run
  if (status.nextScheduledRun) {
    const nextRun = new Date(status.nextScheduledRun);
    elements.nextRun.textContent = formatDateTime(nextRun);
  } else {
    elements.nextRun.textContent = '--';
  }

  // Statistics
  if (status.stats) {
    elements.totalPosts.textContent = status.stats.totalPosts;
    elements.successPosts.textContent = status.stats.successfulPosts;
    elements.failedPosts.textContent = status.stats.failedPosts;
    elements.successRate.textContent = status.stats.successRate + '%';
  }

  // Posting status
  if (status.postingInProgress) {
    elements.postingBadge.classList.remove('hidden');
    elements.postNowBtn.disabled = true;
  } else {
    elements.postingBadge.classList.add('hidden');
    elements.postNowBtn.disabled = false;
  }
}

function renderHistory(history) {
  if (!history || history.length === 0) {
    elements.historyList.innerHTML = '<p class="empty-state">No posts yet</p>';
    return;
  }

  const html = history.map(entry => `
    <div class="history-item">
      <div class="history-icon ${entry.success ? 'success' : 'failure'}">
        ${entry.success ? '✓' : '✗'}
      </div>
      <div class="history-content">
        <div class="history-text">${escapeHtml(entry.postText)}</div>
        <div class="history-meta">
          <span>${formatDateTime(new Date(entry.timestamp))}</span>
          <span>${entry.duration ? (entry.duration / 1000).toFixed(1) + 's' : '--'}</span>
          <span class="history-badge ${entry.trigger}">${entry.trigger}</span>
        </div>
      </div>
    </div>
  `).join('');

  elements.historyList.innerHTML = html;
}

function addLog(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const entry = document.createElement('p');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${timestamp}] ${message}`;

  elements.logList.appendChild(entry);
  elements.logList.scrollTop = elements.logList.scrollHeight;

  // Keep only last 50 entries
  while (elements.logList.children.length > 50) {
    elements.logList.removeChild(elements.logList.firstChild);
  }
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'}</span>
    <span>${escapeHtml(message)}</span>
  `;

  elements.toastContainer.appendChild(toast);

  // Auto-remove after 5 seconds
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

// =============================================================================
// API Functions
// =============================================================================

async function startScheduler() {
  try {
    const response = await fetch('/api/scheduler/start', { method: 'POST' });
    const data = await response.json();

    if (response.ok) {
      addLog('Scheduler started', 'success');
      showToast('Scheduler started', 'success');
    } else {
      addLog(`Failed to start scheduler: ${data.error}`, 'error');
      showToast(data.error, 'error');
    }
  } catch (error) {
    addLog(`Error: ${error.message}`, 'error');
    showToast('Failed to start scheduler', 'error');
  }
}

async function stopScheduler() {
  try {
    const response = await fetch('/api/scheduler/stop', { method: 'POST' });
    const data = await response.json();

    if (response.ok) {
      addLog('Scheduler stopped', 'warning');
      showToast('Scheduler stopped', 'info');
    } else {
      addLog(`Failed to stop scheduler: ${data.error}`, 'error');
      showToast(data.error, 'error');
    }
  } catch (error) {
    addLog(`Error: ${error.message}`, 'error');
    showToast('Failed to stop scheduler', 'error');
  }
}

async function postNow() {
  const text = elements.postText.value.trim();
  const buttonUrl = elements.buttonUrl.value.trim();
  const buttonText = elements.buttonText.value.trim();

  if (!text) {
    showToast('Please enter post text', 'error');
    return;
  }

  try {
    elements.postNowBtn.disabled = true;
    addLog('Initiating manual post...', 'info');

    const response = await fetch('/api/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, buttonUrl, buttonText })
    });

    const data = await response.json();

    if (response.ok) {
      addLog('Post initiated - waiting for completion...', 'info');
      showToast('Post initiated', 'info');
      // Clear the form
      elements.postText.value = '';
      elements.buttonUrl.value = '';
      elements.buttonText.value = '';
    } else {
      addLog(`Failed to initiate post: ${data.error}`, 'error');
      showToast(data.error, 'error');
      elements.postNowBtn.disabled = false;
    }
  } catch (error) {
    addLog(`Error: ${error.message}`, 'error');
    showToast('Failed to initiate post', 'error');
    elements.postNowBtn.disabled = false;
  }
}

async function refreshHistory() {
  try {
    const response = await fetch('/api/history');
    const history = await response.json();
    renderHistory(history);
    addLog('History refreshed', 'info');
  } catch (error) {
    addLog(`Failed to refresh history: ${error.message}`, 'error');
  }
}

function clearLog() {
  elements.logList.innerHTML = '<p class="log-entry info">Log cleared</p>';
}

// =============================================================================
// Utility Functions
// =============================================================================

function formatDateTime(date) {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// =============================================================================
// Load Initial Config
// =============================================================================

async function loadConfig() {
  try {
    const response = await fetch('/api/config');
    const config = await response.json();

    // Set default values in form
    if (config.defaultPostText) {
      elements.postText.placeholder = config.defaultPostText;
    }
    if (config.defaultButtonUrl) {
      elements.buttonUrl.placeholder = config.defaultButtonUrl;
    }
    if (config.defaultButtonText) {
      elements.buttonText.placeholder = config.defaultButtonText;
    }
  } catch (error) {
    console.error('Failed to load config:', error);
  }
}

// Initialize
loadConfig();
