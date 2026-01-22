/**
 * Google Business Profile Auto-Poster
 * Main Entry Point
 *
 * This module starts the scheduled automation for posting to Google Business Profile.
 * Run with: npm start (after building) or npm run dev (for development)
 */

import { getConfig, getDefaultPostContent, PostContent } from './config';
import { initLogger } from './logger';
import { startScheduler, stopScheduler, describeCronSchedule } from './scheduler';
import fs from 'fs';
import path from 'path';

// Track startup time for logging
const startTime = new Date();

/**
 * Content provider function
 *
 * This function is called before each scheduled post.
 * Customize this to fetch content from your database, API, or any other source.
 *
 * @returns PostContent for the next scheduled post
 */
async function getPostContent(): Promise<PostContent> {
  // Option 1: Use default content from environment variables
  const defaultContent = getDefaultPostContent();

  // Option 2: Load content from a JSON file (rotates through posts)
  const postsFile = path.join(process.cwd(), 'posts.json');
  if (fs.existsSync(postsFile)) {
    try {
      const posts: PostContent[] = JSON.parse(fs.readFileSync(postsFile, 'utf-8'));

      if (posts.length > 0) {
        // Simple rotation: use day of year to select post
        const dayOfYear = Math.floor(
          (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) /
          (1000 * 60 * 60 * 24)
        );
        const postIndex = dayOfYear % posts.length;
        return posts[postIndex];
      }
    } catch (error) {
      // Fall back to default if JSON is invalid
      console.warn('Warning: Could not parse posts.json, using default content');
    }
  }

  // Option 3: Fetch from an API (example placeholder)
  // const response = await fetch('https://your-api.com/next-post');
  // return response.json();

  return defaultContent;
}

/**
 * Main application entry point
 */
async function main(): Promise<void> {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     Google Business Profile Auto-Poster                      ║');
  console.log('║     Starting scheduler...                                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // Load configuration
  let config;
  try {
    config = getConfig();
  } catch (error) {
    console.error('Configuration error:', error instanceof Error ? error.message : error);
    console.error('');
    console.error('Please ensure you have created a .env file with the required credentials.');
    console.error('See .env.example for the required variables.');
    process.exit(1);
  }

  // Initialize logger
  const logger = initLogger(config.logLevel, config.logFile);
  logger.info(`Application started at ${startTime.toISOString()}`);
  logger.info(`Node.js ${process.version}`);

  // Ensure logs directory exists
  if (!fs.existsSync('logs')) {
    fs.mkdirSync('logs', { recursive: true });
  }
  if (!fs.existsSync('logs/screenshots')) {
    fs.mkdirSync('logs/screenshots', { recursive: true });
  }

  // Display configuration
  logger.info('Configuration loaded:');
  logger.info(`  - Business: ${config.businessName}`);
  logger.info(`  - Schedule: ${describeCronSchedule(config.scheduleCron)}`);
  logger.info(`  - Timezone: ${config.timezone}`);
  logger.info(`  - Headless: ${config.headless}`);
  logger.info(`  - Max retries: ${config.maxRetries}`);

  // Start the scheduler
  const scheduler = startScheduler(
    getPostContent,
    config,
    logger,
    (result) => {
      // Callback after each post attempt
      if (result.success) {
        logger.info('Post completed successfully');
      } else {
        logger.error(`Post failed: ${result.message}`);
        // You could add notification logic here (email, Slack, etc.)
      }
    }
  );

  // Handle graceful shutdown
  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    stopScheduler(logger);
    logger.info('Goodbye!');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Keep the process running
  console.log('');
  console.log('Scheduler is running. Press Ctrl+C to stop.');
  console.log(`Next post will be published at: ${describeCronSchedule(config.scheduleCron)}`);
  console.log('');
  console.log('Logs are being written to:', config.logFile);
  console.log('');

  // Prevent Node.js from exiting
  // The scheduler runs on its own timer, but we need to keep the process alive
  await new Promise(() => {});
}

// Run the application
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
