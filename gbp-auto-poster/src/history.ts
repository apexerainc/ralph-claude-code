/**
 * Post History Tracking (Multi-Business Support)
 *
 * Stores and retrieves post history per business from JSON files.
 */

import fs from 'fs';
import path from 'path';

const HISTORY_DIR = path.join(process.cwd(), 'logs', 'history');
const MAX_HISTORY_ENTRIES = 100;

export interface PostHistoryEntry {
  id: string;
  timestamp: string;
  businessId: string;
  businessName: string;
  success: boolean;
  message: string;
  postText: string;
  duration?: number;
  screenshotPath?: string;
  error?: string;
  trigger: 'scheduled' | 'manual';
}

/**
 * Ensure history directory exists
 */
function ensureHistoryDir(): void {
  if (!fs.existsSync(HISTORY_DIR)) {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
  }
}

/**
 * Get history file path for a business
 */
function getHistoryFilePath(businessId: string): string {
  return path.join(HISTORY_DIR, `${businessId}.json`);
}

/**
 * Load post history for a specific business
 */
export function loadBusinessHistory(businessId: string): PostHistoryEntry[] {
  ensureHistoryDir();
  const filePath = getHistoryFilePath(businessId);

  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error loading history for ${businessId}:`, error);
    return [];
  }
}

/**
 * Load all history across all businesses
 */
export function loadAllHistory(): PostHistoryEntry[] {
  ensureHistoryDir();

  try {
    const files = fs.readdirSync(HISTORY_DIR).filter(f => f.endsWith('.json'));
    const allHistory: PostHistoryEntry[] = [];

    for (const file of files) {
      const filePath = path.join(HISTORY_DIR, file);
      try {
        const data = fs.readFileSync(filePath, 'utf-8');
        const history = JSON.parse(data) as PostHistoryEntry[];
        allHistory.push(...history);
      } catch {
        // Skip corrupted files
      }
    }

    // Sort by timestamp descending
    return allHistory.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  } catch (error) {
    console.error('Error loading all history:', error);
    return [];
  }
}

/**
 * Save post history for a specific business
 */
export function saveBusinessHistory(businessId: string, history: PostHistoryEntry[]): void {
  ensureHistoryDir();

  // Keep only the most recent entries
  const trimmedHistory = history.slice(-MAX_HISTORY_ENTRIES);
  const filePath = getHistoryFilePath(businessId);

  try {
    fs.writeFileSync(filePath, JSON.stringify(trimmedHistory, null, 2));
  } catch (error) {
    console.error(`Error saving history for ${businessId}:`, error);
  }
}

/**
 * Add a new entry to post history for a business
 */
export function addHistoryEntry(
  businessId: string,
  businessName: string,
  entry: Omit<PostHistoryEntry, 'id' | 'timestamp' | 'businessId' | 'businessName'>
): PostHistoryEntry {
  const history = loadBusinessHistory(businessId);

  const newEntry: PostHistoryEntry = {
    ...entry,
    id: generateId(),
    timestamp: new Date().toISOString(),
    businessId,
    businessName
  };

  history.push(newEntry);
  saveBusinessHistory(businessId, history);

  return newEntry;
}

/**
 * Get recent history for a specific business
 */
export function getRecentHistory(businessId: string, limit: number = 20): PostHistoryEntry[] {
  const history = loadBusinessHistory(businessId);
  return history.slice(-limit).reverse();
}

/**
 * Get recent history across all businesses
 */
export function getAllRecentHistory(limit: number = 50): PostHistoryEntry[] {
  return loadAllHistory().slice(0, limit);
}

/**
 * Get statistics for a specific business
 */
export function getBusinessStats(businessId: string): {
  totalPosts: number;
  successfulPosts: number;
  failedPosts: number;
  successRate: number;
  lastPostTime: string | null;
  lastPostSuccess: boolean | null;
} {
  const history = loadBusinessHistory(businessId);

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
 * Get aggregate statistics across all businesses
 */
export function getGlobalStats(): {
  totalPosts: number;
  successfulPosts: number;
  failedPosts: number;
  successRate: number;
  businessesPosted: number;
} {
  const allHistory = loadAllHistory();

  const totalPosts = allHistory.length;
  const successfulPosts = allHistory.filter(h => h.success).length;
  const failedPosts = totalPosts - successfulPosts;
  const successRate = totalPosts > 0 ? (successfulPosts / totalPosts) * 100 : 0;
  const businessesPosted = new Set(allHistory.map(h => h.businessId)).size;

  return {
    totalPosts,
    successfulPosts,
    failedPosts,
    successRate: Math.round(successRate * 10) / 10,
    businessesPosted
  };
}

/**
 * Clear history for a specific business
 */
export function clearBusinessHistory(businessId: string): void {
  saveBusinessHistory(businessId, []);
}

/**
 * Generate a unique ID for history entries
 */
function generateId(): string {
  return `post_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Legacy exports for backward compatibility
export function loadHistory(): PostHistoryEntry[] {
  return loadAllHistory();
}

export function getHistoryStats() {
  return getGlobalStats();
}
