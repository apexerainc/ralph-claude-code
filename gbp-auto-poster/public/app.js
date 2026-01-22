/**
 * Google Business Profile Multi-Poster Dashboard
 * Frontend JavaScript
 */

// Socket.IO connection
const socket = io();

// State
let businesses = [];
let selectedBusinessId = null;
let selectedBusiness = null;

// DOM Elements
const elements = {
  // Global
  globalTotal: document.getElementById('globalTotal'),
  globalActive: document.getElementById('globalActive'),
  globalPosts: document.getElementById('globalPosts'),
  businessList: document.getElementById('businessList'),
  logList: document.getElementById('logList'),
  toastContainer: document.getElementById('toastContainer'),

  // Main content
  placeholder: document.getElementById('placeholder'),
  businessDetail: document.getElementById('businessDetail'),

  // Detail view
  detailName: document.getElementById('detailName'),
  detailSchedulerBadge: document.getElementById('detailSchedulerBadge'),
  detailCron: document.getElementById('detailCron'),
  detailTimezone: document.getElementById('detailTimezone'),
  detailNextRun: document.getElementById('detailNextRun'),
  postingIndicator: document.getElementById('postingIndicator'),
  startSchedulerBtn: document.getElementById('startSchedulerBtn'),
  stopSchedulerBtn: document.getElementById('stopSchedulerBtn'),
  detailTotal: document.getElementById('detailTotal'),
  detailSuccess: document.getElementById('detailSuccess'),
  detailFailed: document.getElementById('detailFailed'),
  detailRate: document.getElementById('detailRate'),
  postText: document.getElementById('postText'),
  buttonUrl: document.getElementById('buttonUrl'),
  buttonText: document.getElementById('buttonText'),
  postNowBtn: document.getElementById('postNowBtn'),
  historyList: document.getElementById('historyList')
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

socket.on('global-status', (status) => {
  updateGlobalStatus(status);
});

socket.on('businesses', (data) => {
  businesses = data;
  renderBusinessList();
  updateGlobalCounts();
});

socket.on('business-updated', (business) => {
  if (!business) return;

  // Update in local state
  const index = businesses.findIndex(b => b.id === business.id);
  if (index !== -1) {
    businesses[index] = business;
  }

  // Re-render list
  renderBusinessList();
  updateGlobalCounts();

  // Update detail view if this is the selected business
  if (selectedBusinessId === business.id) {
    selectedBusiness = business;
    updateDetailView();
  }
});

socket.on('posting-started', ({ businessId, businessName, trigger }) => {
  addLog(`Posting started for ${businessName} (${trigger})`, 'info');

  // Update business card
  const card = document.querySelector(`[data-business-id="${businessId}"]`);
  if (card) {
    card.classList.add('posting');
    const dot = card.querySelector('.status-dot');
    if (dot) dot.classList.add('posting');
  }

  // Update detail view
  if (selectedBusinessId === businessId) {
    elements.postingIndicator.classList.remove('hidden');
    elements.postNowBtn.disabled = true;
  }
});

socket.on('posting-complete', ({ businessId, businessName, result }) => {
  if (result.success) {
    addLog(`Post successful for ${businessName}`, 'success');
    showToast(`Posted to ${businessName}`, 'success');
  } else {
    addLog(`Post failed for ${businessName}: ${result.message}`, 'error');
    showToast(`Failed: ${result.message}`, 'error');
  }

  // Update business card
  const card = document.querySelector(`[data-business-id="${businessId}"]`);
  if (card) {
    card.classList.remove('posting');
    const dot = card.querySelector('.status-dot');
    if (dot) dot.classList.remove('posting');
  }

  // Update detail view
  if (selectedBusinessId === businessId) {
    elements.postingIndicator.classList.add('hidden');
    elements.postNowBtn.disabled = false;
    refreshHistory();
  }
});

// =============================================================================
// UI Rendering
// =============================================================================

function updateGlobalStatus(status) {
  elements.globalTotal.textContent = status.totalBusinesses;
  elements.globalActive.textContent = status.activeSchedulers;
  elements.globalPosts.textContent = status.stats?.totalPosts || 0;
}

function updateGlobalCounts() {
  const total = businesses.length;
  const active = businesses.filter(b => b.schedulerRunning).length;
  const posts = businesses.reduce((sum, b) => sum + (b.stats?.totalPosts || 0), 0);

  elements.globalTotal.textContent = total;
  elements.globalActive.textContent = active;
  elements.globalPosts.textContent = posts;
}

function renderBusinessList() {
  if (!businesses || businesses.length === 0) {
    elements.businessList.innerHTML = '<p class="empty-state">No businesses configured</p>';
    return;
  }

  const html = businesses.map(business => {
    const isSelected = business.id === selectedBusinessId;
    const isPosting = business.postingInProgress;
    const isScheduled = business.schedulerRunning;

    return `
      <div class="business-card ${isSelected ? 'selected' : ''} ${isPosting ? 'posting' : ''}"
           data-business-id="${business.id}"
           onclick="selectBusiness('${business.id}')">
        <div class="business-card-header">
          <span class="business-card-name">${escapeHtml(business.name)}</span>
          <div class="business-card-status">
            <span class="status-dot ${isScheduled ? 'active' : ''} ${isPosting ? 'posting' : ''}"></span>
          </div>
        </div>
        <div class="business-card-meta">
          <span>${business.stats?.totalPosts || 0} posts</span>
          <span>${isScheduled ? 'Scheduled' : 'Not scheduled'}</span>
        </div>
      </div>
    `;
  }).join('');

  elements.businessList.innerHTML = html;
}

function updateDetailView() {
  if (!selectedBusiness) return;

  const b = selectedBusiness;

  // Header
  elements.detailName.textContent = b.name;

  // Scheduler badge
  if (b.schedulerRunning) {
    elements.detailSchedulerBadge.textContent = 'Scheduled';
    elements.detailSchedulerBadge.className = 'status-badge running';
    elements.startSchedulerBtn.disabled = true;
    elements.stopSchedulerBtn.disabled = false;
  } else {
    elements.detailSchedulerBadge.textContent = 'Not Scheduled';
    elements.detailSchedulerBadge.className = 'status-badge stopped';
    elements.startSchedulerBtn.disabled = false;
    elements.stopSchedulerBtn.disabled = true;
  }

  // Schedule info
  elements.detailCron.textContent = b.schedule?.cron || '0 9 * * *';
  elements.detailTimezone.textContent = b.schedule?.timezone || 'America/New_York';

  if (b.nextScheduledRun) {
    elements.detailNextRun.textContent = formatDateTime(new Date(b.nextScheduledRun));
  } else {
    elements.detailNextRun.textContent = '--';
  }

  // Posting indicator
  if (b.postingInProgress) {
    elements.postingIndicator.classList.remove('hidden');
    elements.postNowBtn.disabled = true;
  } else {
    elements.postingIndicator.classList.add('hidden');
    elements.postNowBtn.disabled = false;
  }

  // Stats
  elements.detailTotal.textContent = b.stats?.totalPosts || 0;
  elements.detailSuccess.textContent = b.stats?.successfulPosts || 0;
  elements.detailFailed.textContent = b.stats?.failedPosts || 0;
  elements.detailRate.textContent = (b.stats?.successRate || 0) + '%';

  // Default post content
  if (b.defaultPost) {
    elements.postText.placeholder = b.defaultPost.text || 'Enter post content...';
    elements.buttonUrl.placeholder = b.defaultPost.buttonUrl || 'https://example.com';
    elements.buttonText.placeholder = b.defaultPost.buttonText || 'Learn More';
  }
}

function renderHistory(history) {
  if (!history || history.length === 0) {
    elements.historyList.innerHTML = '<p class="empty-state">No posts yet for this business</p>';
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

  // Keep only last 30 entries
  while (elements.logList.children.length > 30) {
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

  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

// =============================================================================
// Business Selection
// =============================================================================

function selectBusiness(businessId) {
  selectedBusinessId = businessId;
  selectedBusiness = businesses.find(b => b.id === businessId);

  if (!selectedBusiness) return;

  // Update UI
  elements.placeholder.classList.add('hidden');
  elements.businessDetail.classList.remove('hidden');

  // Update list selection
  document.querySelectorAll('.business-card').forEach(card => {
    card.classList.remove('selected');
  });
  const selectedCard = document.querySelector(`[data-business-id="${businessId}"]`);
  if (selectedCard) {
    selectedCard.classList.add('selected');
  }

  // Update detail view
  updateDetailView();

  // Load history
  refreshHistory();

  // Clear form
  elements.postText.value = '';
  elements.buttonUrl.value = '';
  elements.buttonText.value = '';

  addLog(`Selected: ${selectedBusiness.name}`, 'info');
}

function deselectBusiness() {
  selectedBusinessId = null;
  selectedBusiness = null;

  elements.placeholder.classList.remove('hidden');
  elements.businessDetail.classList.add('hidden');

  document.querySelectorAll('.business-card').forEach(card => {
    card.classList.remove('selected');
  });
}

// =============================================================================
// API Functions
// =============================================================================

async function startScheduler() {
  if (!selectedBusinessId) return;

  try {
    const response = await fetch(`/api/businesses/${selectedBusinessId}/scheduler/start`, {
      method: 'POST'
    });
    const data = await response.json();

    if (response.ok) {
      addLog(`Scheduler started for ${selectedBusiness.name}`, 'success');
      showToast('Daily posting enabled', 'success');
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
  if (!selectedBusinessId) return;

  try {
    const response = await fetch(`/api/businesses/${selectedBusinessId}/scheduler/stop`, {
      method: 'POST'
    });
    const data = await response.json();

    if (response.ok) {
      addLog(`Scheduler stopped for ${selectedBusiness.name}`, 'warning');
      showToast('Daily posting disabled', 'info');
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
  if (!selectedBusinessId) return;

  const text = elements.postText.value.trim() || selectedBusiness.defaultPost?.text;
  const buttonUrl = elements.buttonUrl.value.trim() || selectedBusiness.defaultPost?.buttonUrl;
  const buttonText = elements.buttonText.value.trim() || selectedBusiness.defaultPost?.buttonText;

  if (!text) {
    showToast('Please enter post text or use default', 'error');
    return;
  }

  try {
    elements.postNowBtn.disabled = true;
    addLog(`Initiating post for ${selectedBusiness.name}...`, 'info');

    const response = await fetch(`/api/businesses/${selectedBusinessId}/post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, buttonUrl, buttonText })
    });

    const data = await response.json();

    if (response.ok) {
      showToast('Post initiated', 'info');
      // Clear form
      elements.postText.value = '';
      elements.buttonUrl.value = '';
      elements.buttonText.value = '';
    } else {
      addLog(`Failed: ${data.error}`, 'error');
      showToast(data.error, 'error');
      elements.postNowBtn.disabled = false;
    }
  } catch (error) {
    addLog(`Error: ${error.message}`, 'error');
    showToast('Failed to initiate post', 'error');
    elements.postNowBtn.disabled = false;
  }
}

function useDefaultPost() {
  if (!selectedBusiness?.defaultPost) return;

  elements.postText.value = selectedBusiness.defaultPost.text || '';
  elements.buttonUrl.value = selectedBusiness.defaultPost.buttonUrl || '';
  elements.buttonText.value = selectedBusiness.defaultPost.buttonText || '';
}

async function refreshHistory() {
  if (!selectedBusinessId) return;

  try {
    const response = await fetch(`/api/businesses/${selectedBusinessId}/history`);
    const history = await response.json();
    renderHistory(history);
  } catch (error) {
    addLog(`Failed to refresh history: ${error.message}`, 'error');
  }
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
// Initialize
// =============================================================================

async function init() {
  try {
    const response = await fetch('/api/businesses');
    businesses = await response.json();
    renderBusinessList();
    updateGlobalCounts();
    addLog(`Loaded ${businesses.length} businesses`, 'info');
  } catch (error) {
    addLog(`Failed to load businesses: ${error.message}`, 'error');
  }
}

init();
