/**
 * Configuration module for Google Business Profile Auto-Poster
 *
 * Reads configuration from environment variables for security.
 * All sensitive credentials are stored in .env file (never committed to git).
 */

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/**
 * Post content structure for Google Business Profile
 */
export interface PostContent {
  /** Main text content of the post (required) */
  text: string;
  /** Optional URL to an image file */
  imagePath?: string;
  /** Optional call-to-action button URL */
  buttonUrl?: string;
  /** Optional call-to-action button text */
  buttonText?: string;
}

/**
 * Configuration interface for the automation
 */
export interface Config {
  // Google credentials
  googleEmail: string;
  googlePassword: string;

  // Business profile settings
  businessName: string;

  // Scheduler settings
  scheduleCron: string;  // Cron expression for scheduling
  timezone: string;      // Timezone for the scheduler

  // Browser settings
  headless: boolean;     // Run browser in headless mode
  slowMo: number;        // Slow down browser actions (ms) for debugging
  timeout: number;       // Default timeout for operations (ms)

  // Retry settings
  maxRetries: number;    // Maximum number of retry attempts
  retryDelay: number;    // Delay between retries (ms)

  // Logging
  logLevel: string;      // winston log level
  logFile: string;       // Path to log file
}

/**
 * Validates that all required environment variables are set
 * Throws an error with details of missing variables
 */
function validateConfig(): void {
  const required = [
    'GOOGLE_EMAIL',
    'GOOGLE_PASSWORD',
    'BUSINESS_NAME'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Please copy .env.example to .env and fill in your credentials.'
    );
  }
}

/**
 * Get the application configuration
 * Validates required fields and applies defaults for optional ones
 */
export function getConfig(): Config {
  validateConfig();

  return {
    // Google credentials (required)
    googleEmail: process.env.GOOGLE_EMAIL!,
    googlePassword: process.env.GOOGLE_PASSWORD!,

    // Business settings (required)
    businessName: process.env.BUSINESS_NAME!,

    // Scheduler settings (optional with defaults)
    // Default: Every day at 9:00 AM
    scheduleCron: process.env.SCHEDULE_CRON || '0 9 * * *',
    timezone: process.env.TIMEZONE || 'America/New_York',

    // Browser settings (optional with defaults)
    headless: process.env.HEADLESS !== 'false',  // Default: true
    slowMo: parseInt(process.env.SLOW_MO || '0', 10),
    timeout: parseInt(process.env.TIMEOUT || '30000', 10),

    // Retry settings (optional with defaults)
    maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
    retryDelay: parseInt(process.env.RETRY_DELAY || '5000', 10),

    // Logging (optional with defaults)
    logLevel: process.env.LOG_LEVEL || 'info',
    logFile: process.env.LOG_FILE || 'logs/gbp-poster.log'
  };
}

/**
 * Get default post content if none is provided
 * In production, you would typically fetch this from a database or API
 */
export function getDefaultPostContent(): PostContent {
  return {
    text: process.env.DEFAULT_POST_TEXT ||
      'Check out our latest updates! Visit us today for great service and products.',
    buttonUrl: process.env.DEFAULT_BUTTON_URL,
    buttonText: process.env.DEFAULT_BUTTON_TEXT || 'Learn More'
  };
}
