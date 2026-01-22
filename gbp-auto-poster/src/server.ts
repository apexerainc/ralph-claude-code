/**
 * Express Web Server with Dashboard
 *
 * Provides a web interface for managing the Google Business Profile auto-poster.
 * Features:
 * - Real-time status updates via Socket.IO
 * - Post history viewing
 * - Manual post triggering
 * - Scheduler control
 */

import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import cron, { ScheduledTask } from 'node-cron';

import { getConfig, getDefaultPostContent, PostContent } from './config';
import { initLogger } from './logger';
import { postWithRetry, PostResult } from './poster';
import {
  addHistoryEntry,
  getRecentHistory,
  getHistoryStats,
  PostHistoryEntry
} from './history';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

// Initialize configuration and logger
const config = getConfig();
const logger = initLogger(config.logLevel, config.logFile);

// Express app setup
const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// State
let schedulerTask: ScheduledTask | null = null;
let isSchedulerRunning = false;
let isPostingInProgress = false;
let nextScheduledRun: Date | null = null;

/**
 * Calculate next run time from cron expression
 */
function calculateNextRun(cronExpression: string): Date | null {
  try {
    const interval = cron.schedule(cronExpression, () => {}, { scheduled: false });
    // Parse the cron expression to get next run
    // node-cron doesn't expose next run directly, so we calculate it
    const parts = cronExpression.split(' ');
    const now = new Date();
    const next = new Date(now);

    // Simple calculation for daily schedules (minute hour * * *)
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
 * Execute a post and record history
 */
async function executePost(
  content: PostContent,
  trigger: 'scheduled' | 'manual'
): Promise<PostResult> {
  if (isPostingInProgress) {
    return {
      success: false,
      message: 'A post is already in progress',
      timestamp: new Date()
    };
  }

  isPostingInProgress = true;
  io.emit('status', getStatus());
  io.emit('posting-started', { trigger });

  const startTime = Date.now();

  try {
    logger.info(`Starting ${trigger} post...`);
    const result = await postWithRetry(content, config, logger);
    const duration = Date.now() - startTime;

    // Record in history
    const historyEntry = addHistoryEntry({
      success: result.success,
      message: result.message,
      postText: content.text,
      duration,
      screenshotPath: result.screenshotPath,
      error: result.error?.message,
      trigger
    });

    io.emit('posting-complete', { result, historyEntry });
    io.emit('history-updated', getRecentHistory());

    return result;
  } finally {
    isPostingInProgress = false;

    // Update next run time after scheduled post
    if (trigger === 'scheduled' && isSchedulerRunning) {
      nextScheduledRun = calculateNextRun(config.scheduleCron);
    }

    io.emit('status', getStatus());
  }
}

/**
 * Start the scheduler
 */
function startScheduler(): boolean {
  if (isSchedulerRunning) {
    return false;
  }

  try {
    schedulerTask = cron.schedule(
      config.scheduleCron,
      async () => {
        logger.info('Scheduler triggered - executing scheduled post');
        const content = getDefaultPostContent();
        await executePost(content, 'scheduled');
      },
      {
        timezone: config.timezone
      }
    );

    isSchedulerRunning = true;
    nextScheduledRun = calculateNextRun(config.scheduleCron);

    logger.info(`Scheduler started with cron: ${config.scheduleCron}`);
    io.emit('status', getStatus());

    return true;
  } catch (error) {
    logger.error('Failed to start scheduler:', error);
    return false;
  }
}

/**
 * Stop the scheduler
 */
function stopScheduler(): boolean {
  if (!isSchedulerRunning || !schedulerTask) {
    return false;
  }

  schedulerTask.stop();
  schedulerTask = null;
  isSchedulerRunning = false;
  nextScheduledRun = null;

  logger.info('Scheduler stopped');
  io.emit('status', getStatus());

  return true;
}

/**
 * Get current system status
 */
function getStatus() {
  return {
    schedulerRunning: isSchedulerRunning,
    postingInProgress: isPostingInProgress,
    nextScheduledRun: nextScheduledRun?.toISOString() || null,
    cronExpression: config.scheduleCron,
    timezone: config.timezone,
    businessName: config.businessName,
    stats: getHistoryStats()
  };
}

// =============================================================================
// API Routes
// =============================================================================

/**
 * GET /api/status - Get current system status
 */
app.get('/api/status', (_req: Request, res: Response) => {
  res.json(getStatus());
});

/**
 * GET /api/history - Get post history
 */
app.get('/api/history', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 20;
  res.json(getRecentHistory(limit));
});

/**
 * GET /api/stats - Get posting statistics
 */
app.get('/api/stats', (_req: Request, res: Response) => {
  res.json(getHistoryStats());
});

/**
 * POST /api/post - Trigger a manual post
 */
app.post('/api/post', async (req: Request, res: Response) => {
  if (isPostingInProgress) {
    res.status(409).json({ error: 'A post is already in progress' });
    return;
  }

  const { text, imagePath, buttonUrl, buttonText } = req.body;
  const defaultContent = getDefaultPostContent();

  const content: PostContent = {
    text: text || defaultContent.text,
    imagePath: imagePath || defaultContent.imagePath,
    buttonUrl: buttonUrl || defaultContent.buttonUrl,
    buttonText: buttonText || defaultContent.buttonText
  };

  // Don't await - let it run in background
  executePost(content, 'manual');

  res.json({ message: 'Post initiated', content });
});

/**
 * POST /api/scheduler/start - Start the scheduler
 */
app.post('/api/scheduler/start', (_req: Request, res: Response) => {
  const success = startScheduler();
  if (success) {
    res.json({ message: 'Scheduler started', status: getStatus() });
  } else {
    res.status(400).json({ error: 'Scheduler is already running' });
  }
});

/**
 * POST /api/scheduler/stop - Stop the scheduler
 */
app.post('/api/scheduler/stop', (_req: Request, res: Response) => {
  const success = stopScheduler();
  if (success) {
    res.json({ message: 'Scheduler stopped', status: getStatus() });
  } else {
    res.status(400).json({ error: 'Scheduler is not running' });
  }
});

/**
 * GET /api/config - Get safe configuration (no secrets)
 */
app.get('/api/config', (_req: Request, res: Response) => {
  res.json({
    businessName: config.businessName,
    scheduleCron: config.scheduleCron,
    timezone: config.timezone,
    headless: config.headless,
    maxRetries: config.maxRetries,
    timeout: config.timeout,
    defaultPostText: process.env.DEFAULT_POST_TEXT || '',
    defaultButtonUrl: process.env.DEFAULT_BUTTON_URL || '',
    defaultButtonText: process.env.DEFAULT_BUTTON_TEXT || ''
  });
});

/**
 * Serve the dashboard for all other routes
 */
app.get('*', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// =============================================================================
// Socket.IO Events
// =============================================================================

io.on('connection', (socket) => {
  logger.debug('Client connected to dashboard');

  // Send initial status
  socket.emit('status', getStatus());
  socket.emit('history-updated', getRecentHistory());

  socket.on('disconnect', () => {
    logger.debug('Client disconnected from dashboard');
  });
});

// =============================================================================
// Server Startup
// =============================================================================

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     Google Business Profile Auto-Poster Dashboard            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Dashboard:  http://localhost:${PORT}`);
  console.log(`  Business:   ${config.businessName}`);
  console.log(`  Schedule:   ${config.scheduleCron} (${config.timezone})`);
  console.log('');

  // Auto-start scheduler
  startScheduler();

  console.log('  Scheduler:  RUNNING');
  console.log(`  Next post:  ${nextScheduledRun?.toLocaleString() || 'N/A'}`);
  console.log('');
  console.log('═'.repeat(66));
  console.log('');
});
