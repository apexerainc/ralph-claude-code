/**
 * Agency Hub - GBP Automation Dashboard
 * Frontend JavaScript
 */

// Socket.IO connection
const socket = io();

// State
let clients = [];
let selectedClientId = null;
let selectedClient = null;
let editingClientId = null;

// DOM Elements
const elements = {
  // Navigation
  navItems: document.querySelectorAll('.nav-item'),
  pages: document.querySelectorAll('.page'),

  // Clients Page
  clientsGrid: document.getElementById('clientsGrid'),

  // GBP Automation Page
  gbpPlaceholder: document.getElementById('gbpPlaceholder'),
  gbpDetail: document.getElementById('gbpDetail'),
  gbpClientName: document.getElementById('gbpClientName'),
  gbpSchedulerBadge: document.getElementById('gbpSchedulerBadge'),
  gbpCron: document.getElementById('gbpCron'),
  gbpTimezone: document.getElementById('gbpTimezone'),
  gbpNextRun: document.getElementById('gbpNextRun'),
  postingIndicator: document.getElementById('postingIndicator'),
  startSchedulerBtn: document.getElementById('startSchedulerBtn'),
  stopSchedulerBtn: document.getElementById('stopSchedulerBtn'),
  gbpTotalPosts: document.getElementById('gbpTotalPosts'),
  gbpSuccessPosts: document.getElementById('gbpSuccessPosts'),
  gbpFailedPosts: document.getElementById('gbpFailedPosts'),
  gbpSuccessRate: document.getElementById('gbpSuccessRate'),
  postText: document.getElementById('postText'),
  buttonUrl: document.getElementById('buttonUrl'),
  buttonText: document.getElementById('buttonText'),
  postNowBtn: document.getElementById('postNowBtn'),
  historyList: document.getElementById('historyList'),

  // Dashboard
  dashTotalClients: document.getElementById('dashTotalClients'),
  dashGbpEnabled: document.getElementById('dashGbpEnabled'),
  dashActiveSchedules: document.getElementById('dashActiveSchedules'),
  dashTotalPosts: document.getElementById('dashTotalPosts'),
  activityLog: document.getElementById('activityLog'),

  // Modal
  clientModal: document.getElementById('clientModal'),
  modalTitle: document.getElementById('modalTitle'),
  clientName: document.getElementById('clientName'),
  clientGbpEnabled: document.getElementById('clientGbpEnabled'),
  clientDefaultPost: document.getElementById('clientDefaultPost'),
  clientButtonUrl: document.getElementById('clientButtonUrl'),

  // Toast
  toastContainer: document.getElementById('toastContainer')
};

// =============================================================================
// Navigation
// =============================================================================

function initNavigation() {
  elements.navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.getAttribute('data-page');
      navigateToPage(page);
    });
  });
}

function navigateToPage(pageName) {
  // Update nav items
  elements.navItems.forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-page') === pageName);
  });

  // Update pages
  elements.pages.forEach(page => {
    page.classList.toggle('active', page.id === `page-${pageName}`);
  });

  // Update dashboard stats when navigating to dashboard
  if (pageName === 'dashboard') {
    updateDashboard();
  }
}

// =============================================================================
// Socket.IO Event Handlers
// =============================================================================

socket.on('connect', () => {
  console.log('Connected to server');
  showToast('Connected to server', 'success');
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
  showToast('Disconnected from server', 'error');
});

socket.on('businesses', (data) => {
  clients = data;
  renderClientCards();
  updateDashboard();
});

socket.on('business-updated', (business) => {
  if (!business) return;

  // Update in local state
  const index = clients.findIndex(c => c.id === business.id);
  if (index !== -1) {
    clients[index] = business;
  }

  // Re-render
  renderClientCards();
  updateDashboard();

  // Update GBP detail if this is the selected client
  if (selectedClientId === business.id) {
    selectedClient = business;
    updateGbpDetail();
  }
});

socket.on('posting-started', ({ businessId, businessName, trigger }) => {
  addActivityLog(`Posting started for ${businessName} (${trigger})`);

  // Update GBP detail
  if (selectedClientId === businessId) {
    elements.postingIndicator.classList.remove('hidden');
    elements.postNowBtn.disabled = true;
  }
});

socket.on('posting-complete', ({ businessId, businessName, result }) => {
  if (result.success) {
    addActivityLog(`Post successful for ${businessName}`);
    showToast(`Posted to ${businessName}`, 'success');
  } else {
    addActivityLog(`Post failed for ${businessName}: ${result.message}`);
    showToast(`Failed: ${result.message}`, 'error');
  }

  // Update GBP detail
  if (selectedClientId === businessId) {
    elements.postingIndicator.classList.add('hidden');
    elements.postNowBtn.disabled = false;
    refreshHistory();
  }
});

// =============================================================================
// Clients Page
// =============================================================================

function renderClientCards() {
  if (!clients || clients.length === 0) {
    elements.clientsGrid.innerHTML = '<p class="empty-state">No clients configured</p>';
    return;
  }

  const html = clients.map(client => {
    const badges = [];
    if (client.enabled) {
      badges.push('<span class="badge badge-gbp">GBP Enabled</span>');
    }
    if (client.schedulerRunning) {
      badges.push('<span class="badge badge-scheduled">Scheduled</span>');
    }

    return `
      <div class="client-card" data-client-id="${client.id}">
        <div class="client-card-name">${escapeHtml(client.name)}</div>
        <div class="client-card-badges">
          ${badges.join(' ')}
        </div>
        <div class="client-card-actions">
          <button class="btn btn-primary btn-small" onclick="openGbpForClient('${client.id}')">Manage GBP</button>
          <button class="btn btn-secondary btn-small" onclick="editClient('${client.id}')">Edit</button>
        </div>
      </div>
    `;
  }).join('');

  elements.clientsGrid.innerHTML = html;
}

function openGbpForClient(clientId) {
  selectedClientId = clientId;
  selectedClient = clients.find(c => c.id === clientId);

  if (!selectedClient) return;

  // Navigate to GBP page
  navigateToPage('gbp');

  // Show detail view
  elements.gbpPlaceholder.classList.add('hidden');
  elements.gbpDetail.classList.remove('hidden');

  // Update detail
  updateGbpDetail();

  // Load history
  refreshHistory();

  // Clear form
  elements.postText.value = '';
  elements.buttonUrl.value = '';
  elements.buttonText.value = '';
}

function closeGbpDetail() {
  selectedClientId = null;
  selectedClient = null;

  elements.gbpPlaceholder.classList.remove('hidden');
  elements.gbpDetail.classList.add('hidden');

  // Go back to clients page
  navigateToPage('clients');
}

// =============================================================================
// GBP Detail View
// =============================================================================

function updateGbpDetail() {
  if (!selectedClient) return;

  const c = selectedClient;

  // Header
  elements.gbpClientName.textContent = c.name;

  // Scheduler badge
  if (c.schedulerRunning) {
    elements.gbpSchedulerBadge.textContent = 'Scheduled';
    elements.gbpSchedulerBadge.className = 'status-badge scheduled';
    elements.startSchedulerBtn.disabled = true;
    elements.stopSchedulerBtn.disabled = false;
  } else {
    elements.gbpSchedulerBadge.textContent = 'Not Scheduled';
    elements.gbpSchedulerBadge.className = 'status-badge stopped';
    elements.startSchedulerBtn.disabled = false;
    elements.stopSchedulerBtn.disabled = true;
  }

  // Schedule info
  elements.gbpCron.textContent = formatCronExpression(c.schedule?.cron || '0 9 * * *');
  elements.gbpTimezone.textContent = c.schedule?.timezone || 'America/Chicago';

  if (c.nextScheduledRun) {
    elements.gbpNextRun.textContent = formatDateTime(new Date(c.nextScheduledRun));
  } else {
    elements.gbpNextRun.textContent = '--';
  }

  // Posting indicator
  if (c.postingInProgress) {
    elements.postingIndicator.classList.remove('hidden');
    elements.postNowBtn.disabled = true;
  } else {
    elements.postingIndicator.classList.add('hidden');
    elements.postNowBtn.disabled = false;
  }

  // Stats
  elements.gbpTotalPosts.textContent = c.stats?.totalPosts || 0;
  elements.gbpSuccessPosts.textContent = c.stats?.successfulPosts || 0;
  elements.gbpFailedPosts.textContent = c.stats?.failedPosts || 0;
  elements.gbpSuccessRate.textContent = (c.stats?.successRate || 0) + '%';

  // Default post content placeholders
  if (c.defaultPost) {
    elements.postText.placeholder = c.defaultPost.text || 'Enter post content...';
    elements.buttonUrl.placeholder = c.defaultPost.buttonUrl || 'https://example.com';
    elements.buttonText.placeholder = c.defaultPost.buttonText || 'Learn More';
  }
}

function formatCronExpression(cron) {
  const parts = cron.split(' ');
  if (parts.length >= 2) {
    const minute = parseInt(parts[0]) || 0;
    const hour = parseInt(parts[1]) || 9;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    const displayMinute = minute.toString().padStart(2, '0');
    return `${displayHour}:${displayMinute} ${ampm} daily`;
  }
  return cron;
}

// =============================================================================
// Scheduler Controls
// =============================================================================

async function startScheduler() {
  if (!selectedClientId) return;

  try {
    const response = await fetch(`/api/businesses/${selectedClientId}/scheduler/start`, {
      method: 'POST'
    });
    const data = await response.json();

    if (response.ok) {
      showToast('Daily posting enabled', 'success');
      addActivityLog(`Scheduler started for ${selectedClient.name}`);
    } else {
      showToast(data.error, 'error');
    }
  } catch (error) {
    showToast('Failed to start scheduler', 'error');
  }
}

async function stopScheduler() {
  if (!selectedClientId) return;

  try {
    const response = await fetch(`/api/businesses/${selectedClientId}/scheduler/stop`, {
      method: 'POST'
    });
    const data = await response.json();

    if (response.ok) {
      showToast('Daily posting disabled', 'info');
      addActivityLog(`Scheduler stopped for ${selectedClient.name}`);
    } else {
      showToast(data.error, 'error');
    }
  } catch (error) {
    showToast('Failed to stop scheduler', 'error');
  }
}

// =============================================================================
// Manual Posting
// =============================================================================

async function postNow() {
  if (!selectedClientId) return;

  const text = elements.postText.value.trim() || selectedClient.defaultPost?.text;
  const buttonUrlVal = elements.buttonUrl.value.trim() || selectedClient.defaultPost?.buttonUrl;
  const buttonTextVal = elements.buttonText.value.trim() || selectedClient.defaultPost?.buttonText;

  if (!text) {
    showToast('Please enter post text or use default', 'error');
    return;
  }

  try {
    elements.postNowBtn.disabled = true;
    addActivityLog(`Initiating post for ${selectedClient.name}...`);

    const response = await fetch(`/api/businesses/${selectedClientId}/post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, buttonUrl: buttonUrlVal, buttonText: buttonTextVal })
    });

    const data = await response.json();

    if (response.ok) {
      showToast('Post initiated', 'info');
      elements.postText.value = '';
      elements.buttonUrl.value = '';
      elements.buttonText.value = '';
    } else {
      showToast(data.error, 'error');
      elements.postNowBtn.disabled = false;
    }
  } catch (error) {
    showToast('Failed to initiate post', 'error');
    elements.postNowBtn.disabled = false;
  }
}

function useDefaultPost() {
  if (!selectedClient?.defaultPost) return;

  elements.postText.value = selectedClient.defaultPost.text || '';
  elements.buttonUrl.value = selectedClient.defaultPost.buttonUrl || '';
  elements.buttonText.value = selectedClient.defaultPost.buttonText || '';
}

// =============================================================================
// History
// =============================================================================

async function refreshHistory() {
  if (!selectedClientId) return;

  try {
    const response = await fetch(`/api/businesses/${selectedClientId}/history`);
    const history = await response.json();
    renderHistory(history);
  } catch (error) {
    console.error('Failed to refresh history:', error);
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
        <div class="history-text">${escapeHtml(entry.postText || entry.message || 'Post')}</div>
        <div class="history-meta">
          <span>${formatDateTime(new Date(entry.timestamp))}</span>
          <span>${entry.duration ? (entry.duration / 1000).toFixed(1) + 's' : '--'}</span>
          <span class="history-badge ${entry.trigger}">${entry.trigger || 'manual'}</span>
        </div>
      </div>
    </div>
  `).join('');

  elements.historyList.innerHTML = html;
}

// =============================================================================
// Dashboard
// =============================================================================

function updateDashboard() {
  const totalClients = clients.length;
  const gbpEnabled = clients.filter(c => c.enabled).length;
  const activeSchedules = clients.filter(c => c.schedulerRunning).length;
  const totalPosts = clients.reduce((sum, c) => sum + (c.stats?.totalPosts || 0), 0);

  elements.dashTotalClients.textContent = totalClients;
  elements.dashGbpEnabled.textContent = gbpEnabled;
  elements.dashActiveSchedules.textContent = activeSchedules;
  elements.dashTotalPosts.textContent = totalPosts;
}

function addActivityLog(message) {
  const item = document.createElement('div');
  item.className = 'activity-item';
  item.innerHTML = `
    <div>${escapeHtml(message)}</div>
    <div class="activity-time">${new Date().toLocaleTimeString()}</div>
  `;

  // Remove empty state if exists
  const emptyState = elements.activityLog.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }

  elements.activityLog.insertBefore(item, elements.activityLog.firstChild);

  // Keep only last 20 entries
  while (elements.activityLog.children.length > 20) {
    elements.activityLog.removeChild(elements.activityLog.lastChild);
  }
}

// =============================================================================
// Client Modal
// =============================================================================

function showAddClientModal() {
  editingClientId = null;
  elements.modalTitle.textContent = 'Add New Client';
  elements.clientName.value = '';
  elements.clientGbpEnabled.checked = true;
  elements.clientDefaultPost.value = '';
  elements.clientButtonUrl.value = '';
  elements.clientModal.classList.remove('hidden');
}

function editClient(clientId) {
  const client = clients.find(c => c.id === clientId);
  if (!client) return;

  editingClientId = clientId;
  elements.modalTitle.textContent = 'Edit Client';
  elements.clientName.value = client.name;
  elements.clientGbpEnabled.checked = client.enabled;
  elements.clientDefaultPost.value = client.defaultPost?.text || '';
  elements.clientButtonUrl.value = client.defaultPost?.buttonUrl || '';
  elements.clientModal.classList.remove('hidden');
}

function closeClientModal() {
  elements.clientModal.classList.add('hidden');
  editingClientId = null;
}

async function saveClient() {
  const name = elements.clientName.value.trim();
  if (!name) {
    showToast('Client name is required', 'error');
    return;
  }

  const clientData = {
    name,
    enabled: elements.clientGbpEnabled.checked,
    defaultPost: {
      text: elements.clientDefaultPost.value.trim(),
      buttonUrl: elements.clientButtonUrl.value.trim(),
      buttonText: 'Learn More'
    }
  };

  try {
    if (editingClientId) {
      // Update existing
      const response = await fetch(`/api/businesses/${editingClientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientData)
      });

      if (response.ok) {
        showToast('Client updated', 'success');
        closeClientModal();
      } else {
        const data = await response.json();
        showToast(data.error || 'Failed to update', 'error');
      }
    } else {
      // Note: Add client API would need to be implemented on the server
      showToast('Adding new clients not yet implemented', 'info');
      closeClientModal();
    }
  } catch (error) {
    showToast('Failed to save client', 'error');
  }
}

// =============================================================================
// Toast Notifications
// =============================================================================

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
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// =============================================================================
// Initialize
// =============================================================================

async function init() {
  // Setup navigation
  initNavigation();

  // Load clients from API
  try {
    const response = await fetch('/api/businesses');
    clients = await response.json();
    renderClientCards();
    updateDashboard();
    console.log(`Loaded ${clients.length} clients`);
  } catch (error) {
    console.error('Failed to load clients:', error);
    showToast('Failed to load clients', 'error');
  }
}

// Start the app
init();
