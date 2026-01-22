/**
 * Logging module using Winston
 *
 * Provides structured logging with file and console transports.
 * Log levels: error, warn, info, debug
 */

import winston from 'winston';
import path from 'path';
import fs from 'fs';

/**
 * Creates and configures the Winston logger instance
 *
 * @param logLevel - The minimum log level to record
 * @param logFile - Path to the log file
 * @returns Configured Winston logger
 */
export function createLogger(
  logLevel: string = 'info',
  logFile: string = 'logs/gbp-poster.log'
): winston.Logger {
  // Ensure log directory exists
  const logDir = path.dirname(logFile);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // Custom format for log messages
  const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
      let log = `${timestamp} [${level.toUpperCase()}] ${message}`;

      // Add stack trace for errors
      if (stack) {
        log += `\n${stack}`;
      }

      // Add any additional metadata
      if (Object.keys(meta).length > 0) {
        log += ` ${JSON.stringify(meta)}`;
      }

      return log;
    })
  );

  // Console format with colors
  const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} ${level}: ${message}`;
    })
  );

  return winston.createLogger({
    level: logLevel,
    format: logFormat,
    transports: [
      // Write all logs to file
      new winston.transports.File({
        filename: logFile,
        maxsize: 5242880, // 5MB
        maxFiles: 5,
        tailable: true
      }),
      // Write errors to separate file
      new winston.transports.File({
        filename: path.join(logDir, 'error.log'),
        level: 'error',
        maxsize: 5242880,
        maxFiles: 5
      }),
      // Console output
      new winston.transports.Console({
        format: consoleFormat
      })
    ]
  });
}

// Default logger instance (can be overridden)
let logger: winston.Logger | null = null;

/**
 * Get or create the default logger instance
 */
export function getLogger(): winston.Logger {
  if (!logger) {
    logger = createLogger();
  }
  return logger;
}

/**
 * Initialize the logger with custom settings
 */
export function initLogger(logLevel: string, logFile: string): winston.Logger {
  logger = createLogger(logLevel, logFile);
  return logger;
}
