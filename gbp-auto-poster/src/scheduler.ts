/**
 * Scheduler module using node-cron
 *
 * Handles scheduling of automated posts to Google Business Profile.
 * Supports configurable cron expressions and timezone settings.
 */

import cron from 'node-cron';
import type { Config, PostContent } from './config';
import type { Logger } from 'winston';
import { postWithRetry, PostResult } from './poster';

/** Scheduled task reference */
let scheduledTask: cron.ScheduledTask | null = null;

/** Callback type for post completion */
export type PostCallback = (result: PostResult) => void;

/**
 * Validates a cron expression
 *
 * @param expression - Cron expression to validate
 * @returns true if valid, false otherwise
 */
export function isValidCronExpression(expression: string): boolean {
  return cron.validate(expression);
}

/**
 * Get human-readable description of cron schedule
 *
 * @param expression - Cron expression
 * @returns Human-readable description
 */
export function describeCronSchedule(expression: string): string {
  // Parse cron expression parts: minute hour day month weekday
  const parts = expression.split(' ');
  if (parts.length !== 5) {
    return `Custom schedule: ${expression}`;
  }

  const [minute, hour, day, month, weekday] = parts;

  // Common patterns
  if (day === '*' && month === '*' && weekday === '*') {
    if (minute === '0' && hour !== '*') {
      return `Every day at ${hour}:00`;
    }
    if (minute !== '*' && hour !== '*') {
      return `Every day at ${hour}:${minute.padStart(2, '0')}`;
    }
  }

  if (day === '*' && month === '*' && weekday !== '*') {
    return `Every ${getWeekdayName(weekday)} at ${hour}:${minute.padStart(2, '0')}`;
  }

  return `Cron: ${expression}`;
}

/**
 * Get weekday name from cron weekday value
 */
function getWeekdayName(weekday: string): string {
  const days: Record<string, string> = {
    '0': 'Sunday',
    '1': 'Monday',
    '2': 'Tuesday',
    '3': 'Wednesday',
    '4': 'Thursday',
    '5': 'Friday',
    '6': 'Saturday',
    '7': 'Sunday',
    '*': 'day'
  };
  return days[weekday] || weekday;
}

/**
 * Start the scheduled posting task
 *
 * @param contentProvider - Function that returns post content for each run
 * @param config - Application configuration
 * @param logger - Winston logger instance
 * @param onComplete - Optional callback after each post attempt
 * @returns The scheduled task instance
 */
export function startScheduler(
  contentProvider: () => PostContent | Promise<PostContent>,
  config: Config,
  logger: Logger,
  onComplete?: PostCallback
): cron.ScheduledTask {
  // Validate cron expression
  if (!isValidCronExpression(config.scheduleCron)) {
    throw new Error(`Invalid cron expression: ${config.scheduleCron}`);
  }

  const scheduleDescription = describeCronSchedule(config.scheduleCron);
  logger.info('='.repeat(50));
  logger.info('Starting Google Business Profile Auto-Poster Scheduler');
  logger.info(`Schedule: ${scheduleDescription}`);
  logger.info(`Timezone: ${config.timezone}`);
  logger.info(`Max retries per post: ${config.maxRetries}`);
  logger.info('='.repeat(50));

  // Create scheduled task
  scheduledTask = cron.schedule(
    config.scheduleCron,
    async () => {
      logger.info('Scheduled task triggered');

      try {
        // Get post content (could be from DB, API, or static config)
        const content = await Promise.resolve(contentProvider());

        logger.info('Starting automated post...');
        const result = await postWithRetry(content, config, logger);

        // Log result
        if (result.success) {
          logger.info(`Scheduled post completed successfully at ${result.timestamp.toISOString()}`);
        } else {
          logger.error(`Scheduled post failed: ${result.message}`);
        }

        // Call completion callback if provided
        if (onComplete) {
          onComplete(result);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Scheduler error: ${errorMessage}`);

        if (onComplete) {
          onComplete({
            success: false,
            message: `Scheduler error: ${errorMessage}`,
            timestamp: new Date(),
            error: error instanceof Error ? error : new Error(String(error))
          });
        }
      }
    },
    {
      scheduled: true,
      timezone: config.timezone
    }
  );

  logger.info('Scheduler started. Waiting for next scheduled time...');
  logger.info(`Next run will be at the next occurrence of: ${scheduleDescription}`);

  return scheduledTask;
}

/**
 * Stop the scheduled task
 */
export function stopScheduler(logger: Logger): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info('Scheduler stopped');
  }
}

/**
 * Get the current scheduler status
 */
export function getSchedulerStatus(): { running: boolean } {
  return {
    running: scheduledTask !== null
  };
}

/**
 * Common cron expressions for reference
 */
export const CRON_PRESETS = {
  // Every day at specific times
  DAILY_9AM: '0 9 * * *',
  DAILY_12PM: '0 12 * * *',
  DAILY_6PM: '0 18 * * *',

  // Multiple times per day
  TWICE_DAILY: '0 9,18 * * *',
  THREE_TIMES_DAILY: '0 9,13,18 * * *',

  // Weekdays only
  WEEKDAYS_9AM: '0 9 * * 1-5',
  WEEKDAYS_12PM: '0 12 * * 1-5',

  // Weekly
  WEEKLY_MONDAY: '0 9 * * 1',
  WEEKLY_FRIDAY: '0 9 * * 5',

  // Testing (frequent)
  EVERY_MINUTE: '* * * * *',
  EVERY_5_MINUTES: '*/5 * * * *',
  EVERY_HOUR: '0 * * * *'
};
