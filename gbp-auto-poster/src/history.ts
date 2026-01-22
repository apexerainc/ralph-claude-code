/**
 * Post History Tracking
 *
 * Stores and retrieves post history from a JSON file.
 */

import fs from 'fs';
import path from 'path';

const HISTORY_FILE = path.join(process.cwd(), 'logs', 'post-history.json');
const MAX_HISTORY_ENTRIES = 100;

export interface PostHistoryEntry {
  id: string;
  timestamp: string;
  success: boolean;
  message: string;
  postText: string;
  duration?: number;
  screenshotPath?: string;
  error?: string;
  trigger: 'scheduled' | 'manual';
}

/**
 * Ensure logs directory exists
 */
function ensureLogsDir(): void {
  const logsDir = path.dirname(HISTORY_FILE);
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

/**
 * Load post history from file
 */
export function loadHistory(): PostHistoryEntry[] {
  ensureLogsDir();

  if (!fs.existsSync(HISTORY_FILE)) {
    return [];
  }

  try {
    const data = fs.readFileSync(HISTORY_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading history:', error);
    return [];
  }
}

/**
 * Save post history to file
 */
export function saveHistory(history: PostHistoryEntry[]): void {
  ensureLogsDir();

  // Keep only the most recent entries
  const trimmedHistory = history.slice(-MAX_HISTORY_ENTRIES);

  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(trimmedHistory, null, 2));
  } catch (error) {
    console.error('Error saving history:', error);
  }
}

/**
 * Add a new entry to post history
 */
export function addHistoryEntry(entry: Omit<PostHistoryEntry, 'id' | 'timestamp'>): PostHistoryEntry {
  const history = loadHistory();

  const newEntry: PostHistoryEntry = {
    ...entry,
    id: generateId(),
    timestamp: new Date().toISOString()
  };

  history.push(newEntry);
  saveHistory(history);

  return newEntry;
}

/**
 * Get recent history entries
 */
export function getRecentHistory(limit: number = 20): PostHistoryEntry[] {
  const history = loadHistory();
  return history.slice(-limit).reverse();
}

/**
 * Get statistics from history
 */
export function getHistoryStats(): {
  totalPosts: number;
  successfulPosts: number;
  failedPosts: number;
  successRate: number;
  lastPostTime: string | null;
  lastPostSuccess: boolean | null;
} {
  const history = loadHistory();

  const totalPosts = history.length;
  const successfulPosts = history.filter(h => h.success).length;
  const failedPosts = totalPosts - successfulPosts;
  const successRate = totalPosts > 0 ? (successfulPosts / totalPosts) * 100 : 0;

  const lastEntry = history[history.length - 1];

  return {
    totalPosts,
    successfulPosts,
    failedPosts,
    successRate: Math.round(successRate * 10) / 10,
    lastPostTime: lastEntry?.timestamp || null,
    lastPostSuccess: lastEntry?.success ?? null
  };
}

/**
 * Clear all history
 */
export function clearHistory(): void {
  saveHistory([]);
}

/**
 * Generate a unique ID for history entries
 */
function generateId(): string {
  return `post_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
