/**
 * Express Web Server with Multi-Business Dashboard
 *
 * Provides a web interface for managing multiple Google Business Profiles.
 * Features:
 * - Business list/grid view
 * - Per-business scheduling
 * - Per-business post history
 * - Manual posting to any business
 * - Real-time updates via Socket.IO
 */

import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import fs from 'fs';
import cron, { ScheduledTask } from 'node-cron';

import { getConfig, PostContent } from './config';
import { initLogger } from './logger';
import { postWithRetry, PostResult } from './poster';
import {
  addHistoryEntry,
  getRecentHistory,
  getBusinessStats,
  getGlobalStats,
  getAllRecentHistory
} from './history';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

// =============================================================================
// Types
// =============================================================================

interface BusinessConfig {
  id: string;
  name: string;
  enabled: boolean;
  schedule: {
    enabled: boolean;
    cron: string;
    timezone: string;
  };
  defaultPost: {
    text: string;
    buttonUrl?: string;
    buttonText?: string;
  };
}

interface BusinessesFile {
  businesses: BusinessConfig[];
}

// =============================================================================
// Initialize
// =============================================================================

const config = getConfig();
const logger = initLogger(config.logLevel, config.logFile);

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// =============================================================================
// Business Management
// =============================================================================

const BUSINESSES_FILE = path.join(process.cwd(), 'businesses.json');
const schedulerTasks: Map<string, ScheduledTask> = new Map();
const postingInProgress: Set<string> = new Set();

/**
 * Load businesses from JSON file
 */
function loadBusinesses(): BusinessConfig[] {
  try {
    if (!fs.existsSync(BUSINESSES_FILE)) {
      logger.warn('businesses.json not found, using empty list');
      return [];
    }
    const data = fs.readFileSync(BUSINESSES_FILE, 'utf-8');
    const parsed: BusinessesFile = JSON.parse(data);
    return parsed.businesses || [];
  } catch (error) {
    logger.error('Error loading businesses:', error);
    return [];
  }
}

/**
 * Save businesses to JSON file
 */
function saveBusinesses(businesses: BusinessConfig[]): void {
  try {
    const data: BusinessesFile = { businesses };
    fs.writeFileSync(BUSINESSES_FILE, JSON.stringify(data, null, 2));
    logger.info('Businesses saved');
  } catch (error) {
    logger.error('Error saving businesses:', error);
  }
}

/**
 * Get a single business by ID
 */
function getBusiness(businessId: string): BusinessConfig | undefined {
  const businesses = loadBusinesses();
  return businesses.find(b => b.id === businessId);
}

/**
 * Update a business configuration
 */
function updateBusiness(businessId: string, updates: Partial<BusinessConfig>): BusinessConfig | null {
  const businesses = loadBusinesses();
  const index = businesses.findIndex(b => b.id === businessId);

  if (index === -1) return null;

  businesses[index] = { ...businesses[index], ...updates };
  saveBusinesses(businesses);

  return businesses[index];
}

// =============================================================================
// Scheduling
// =============================================================================

/**
 * Calculate next run time from cron expression
 */
function calculateNextRun(cronExpression: string): Date | null {
  try {
    const parts = cronExpression.split(' ');
    const now = new Date();
    const next = new Date(now);

    if (parts.length >= 2) {
      const minute = parseInt(parts[0]) || 0;
      const hour = parseInt(parts[1]) || 9;

      next.setHours(hour, minute, 0, 0);
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
    }

    return next;
  } catch {
    return null;
  }
}

/**
 * Start scheduler for a specific business
 */
function startBusinessScheduler(business: BusinessConfig): boolean {
  if (schedulerTasks.has(business.id)) {
    return false; // Already running
  }

  try {
    const task = cron.schedule(
      business.schedule.cron,
      async () => {
        logger.info(`Scheduled post triggered for: ${business.name}`);
        const content: PostContent = {
          text: business.defaultPost.text,
          buttonUrl: business.defaultPost.buttonUrl,
          buttonText: business.defaultPost.buttonText
        };
        await executePost(business, content, 'scheduled');
      },
      {
        timezone: business.schedule.timezone
      }
    );

    schedulerTasks.set(business.id, task);
    logger.info(`Scheduler started for: ${business.name} (${business.schedule.cron})`);

    // Update business config
    const businesses = loadBusinesses();
    const index = businesses.findIndex(b => b.id === business.id);
    if (index !== -1) {
      businesses[index].schedule.enabled = true;
      saveBusinesses(businesses);
    }

    io.emit('business-updated', getBusinessStatus(business.id));
    return true;
  } catch (error) {
    logger.error(`Failed to start scheduler for ${business.name}:`, error);
    return false;
  }
}

/**
 * Stop scheduler for a specific business
 */
function stopBusinessScheduler(businessId: string): boolean {
  const task = schedulerTasks.get(businessId);
  if (!task) return false;

  task.stop();
  schedulerTasks.delete(businessId);

  // Update business config
  const businesses = loadBusinesses();
  const index = businesses.findIndex(b => b.id === businessId);
  if (index !== -1) {
    businesses[index].schedule.enabled = false;
    saveBusinesses(businesses);
  }

  logger.info(`Scheduler stopped for business: ${businessId}`);
  io.emit('business-updated', getBusinessStatus(businessId));

  return true;
}

/**
 * Initialize schedulers for all businesses with schedule.enabled = true
 */
function initializeSchedulers(): void {
  const businesses = loadBusinesses();

  for (const business of businesses) {
    if (business.enabled && business.schedule.enabled) {
      startBusinessScheduler(business);
    }
  }

  logger.info(`Initialized ${schedulerTasks.size} schedulers`);
}

// =============================================================================
// Posting
// =============================================================================

/**
 * Execute a post for a specific business
 */
async function executePost(
  business: BusinessConfig,
  content: PostContent,
  trigger: 'scheduled' | 'manual'
): Promise<PostResult> {
  if (postingInProgress.has(business.id)) {
    return {
      success: false,
      message: 'A post is already in progress for this business',
      timestamp: new Date()
    };
  }

  postingInProgress.add(business.id);
  io.emit('posting-started', { businessId: business.id, businessName: business.name, trigger });

  const startTime = Date.now();

  try {
    logger.info(`Starting ${trigger} post for: ${business.name}`);

    // Create a config with this specific business name
    const businessConfig = {
      ...config,
      businessName: business.name
    };

    const result = await postWithRetry(content, businessConfig, logger);
    const duration = Date.now() - startTime;

    // Record in history
    const historyEntry = addHistoryEntry(business.id, business.name, {
      success: result.success,
      message: result.message,
      postText: content.text,
      duration,
      screenshotPath: result.screenshotPath,
      error: result.error?.message,
      trigger
    });

    io.emit('posting-complete', { businessId: business.id, businessName: business.name, result, historyEntry });
    io.emit('business-updated', getBusinessStatus(business.id));

    return result;
  } finally {
    postingInProgress.delete(business.id);
  }
}

// =============================================================================
// Status Helpers
// =============================================================================

/**
 * Get status for a specific business
 */
function getBusinessStatus(businessId: string) {
  const business = getBusiness(businessId);
  if (!business) return null;

  const isSchedulerRunning = schedulerTasks.has(businessId);
  const isPosting = postingInProgress.has(businessId);
  const stats = getBusinessStats(businessId);
  const nextRun = isSchedulerRunning ? calculateNextRun(business.schedule.cron) : null;

  return {
    ...business,
    schedulerRunning: isSchedulerRunning,
    postingInProgress: isPosting,
    nextScheduledRun: nextRun?.toISOString() || null,
    stats
  };
}

/**
 * Get global dashboard status
 */
function getGlobalStatus() {
  const businesses = loadBusinesses();
  const activeSchedulers = schedulerTasks.size;
  const stats = getGlobalStats();

  return {
    totalBusinesses: businesses.length,
    activeSchedulers,
    stats
  };
}

// =============================================================================
// API Routes
// =============================================================================

// Get all businesses
app.get('/api/businesses', (_req: Request, res: Response) => {
  const businesses = loadBusinesses();
  const businessStatuses = businesses.map(b => getBusinessStatus(b.id));
  res.json(businessStatuses);
});

// Get global status
app.get('/api/status', (_req: Request, res: Response) => {
  res.json(getGlobalStatus());
});

// Get single business
app.get('/api/businesses/:id', (req: Request, res: Response) => {
  const status = getBusinessStatus(req.params.id);
  if (!status) {
    res.status(404).json({ error: 'Business not found' });
    return;
  }
  res.json(status);
});

// Update business settings
app.patch('/api/businesses/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const updates = req.body;

  const updated = updateBusiness(id, updates);
  if (!updated) {
    res.status(404).json({ error: 'Business not found' });
    return;
  }

  io.emit('business-updated', getBusinessStatus(id));
  res.json(getBusinessStatus(id));
});

// Update business schedule
app.patch('/api/businesses/:id/schedule', (req: Request, res: Response) => {
  const { id } = req.params;
  const { cron: cronExpr, timezone, enabled } = req.body;

  const business = getBusiness(id);
  if (!business) {
    res.status(404).json({ error: 'Business not found' });
    return;
  }

  // Update schedule settings
  const newSchedule = {
    ...business.schedule,
    ...(cronExpr && { cron: cronExpr }),
    ...(timezone && { timezone })
  };

  updateBusiness(id, { schedule: newSchedule });

  // Handle scheduler state
  if (enabled === true) {
    stopBusinessScheduler(id); // Stop if running to apply new settings
    const updatedBusiness = getBusiness(id);
    if (updatedBusiness) {
      startBusinessScheduler(updatedBusiness);
    }
  } else if (enabled === false) {
    stopBusinessScheduler(id);
  }

  res.json(getBusinessStatus(id));
});

// Start scheduler for a business
app.post('/api/businesses/:id/scheduler/start', (req: Request, res: Response) => {
  const business = getBusiness(req.params.id);
  if (!business) {
    res.status(404).json({ error: 'Business not found' });
    return;
  }

  const success = startBusinessScheduler(business);
  if (success) {
    res.json({ message: 'Scheduler started', status: getBusinessStatus(business.id) });
  } else {
    res.status(400).json({ error: 'Scheduler already running or failed to start' });
  }
});

// Stop scheduler for a business
app.post('/api/businesses/:id/scheduler/stop', (req: Request, res: Response) => {
  const success = stopBusinessScheduler(req.params.id);
  if (success) {
    res.json({ message: 'Scheduler stopped', status: getBusinessStatus(req.params.id) });
  } else {
    res.status(400).json({ error: 'Scheduler not running' });
  }
});

// Post to a specific business
app.post('/api/businesses/:id/post', async (req: Request, res: Response) => {
  const business = getBusiness(req.params.id);
  if (!business) {
    res.status(404).json({ error: 'Business not found' });
    return;
  }

  if (postingInProgress.has(business.id)) {
    res.status(409).json({ error: 'A post is already in progress for this business' });
    return;
  }

  const { text, buttonUrl, buttonText } = req.body;

  const content: PostContent = {
    text: text || business.defaultPost.text,
    buttonUrl: buttonUrl || business.defaultPost.buttonUrl,
    buttonText: buttonText || business.defaultPost.buttonText
  };

  // Execute in background
  executePost(business, content, 'manual');

  res.json({ message: 'Post initiated', businessId: business.id, content });
});

// Get history for a business
app.get('/api/businesses/:id/history', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 20;
  const history = getRecentHistory(req.params.id, limit);
  res.json(history);
});

// Get all recent history
app.get('/api/history', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  res.json(getAllRecentHistory(limit));
});

// Get global stats
app.get('/api/stats', (_req: Request, res: Response) => {
  res.json(getGlobalStats());
});

// Update default post for a business
app.patch('/api/businesses/:id/default-post', (req: Request, res: Response) => {
  const business = getBusiness(req.params.id);
  if (!business) {
    res.status(404).json({ error: 'Business not found' });
    return;
  }

  const { text, buttonUrl, buttonText } = req.body;
  const newDefaultPost = {
    ...business.defaultPost,
    ...(text && { text }),
    ...(buttonUrl !== undefined && { buttonUrl }),
    ...(buttonText !== undefined && { buttonText })
  };

  updateBusiness(req.params.id, { defaultPost: newDefaultPost });
  io.emit('business-updated', getBusinessStatus(req.params.id));

  res.json(getBusinessStatus(req.params.id));
});

// Serve the dashboard
app.get('*', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// =============================================================================
// Socket.IO
// =============================================================================

io.on('connection', (socket) => {
  logger.debug('Client connected to dashboard');

  // Send initial data
  socket.emit('global-status', getGlobalStatus());
  socket.emit('businesses', loadBusinesses().map(b => getBusinessStatus(b.id)));

  socket.on('disconnect', () => {
    logger.debug('Client disconnected');
  });
});

// =============================================================================
// Server Startup
// =============================================================================

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  const businesses = loadBusinesses();

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     Google Business Profile Multi-Poster Dashboard           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Dashboard:    http://localhost:${PORT}`);
  console.log(`  Businesses:   ${businesses.length} configured`);
  console.log('');

  // Initialize schedulers
  initializeSchedulers();

  console.log(`  Schedulers:   ${schedulerTasks.size} active`);
  console.log('');
  console.log('═'.repeat(66));
  console.log('');
});
