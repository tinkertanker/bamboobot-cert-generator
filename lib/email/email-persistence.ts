/**
 * Email queue persistence using localStorage
 */

import type { EmailQueueItem } from './types';

export interface PersistedEmailStatus {
  sessionId: string;
  status: 'idle' | 'processing' | 'paused' | 'completed' | 'error';
  processed: number;
  failed: number;
  total: number;
  remaining: number;
  provider: string;
  startTime: number;
  isStarted: boolean;
  error?: string;
  items: EmailQueueItem[];
  createdAt: number;
}

const STORAGE_KEY_PREFIX = 'email-queue-';
const STORAGE_EXPIRY_HOURS = 24; // Keep status for 24 hours

/**
 * Save email queue status to localStorage
 */
export function saveEmailStatus(sessionId: string, status: PersistedEmailStatus): void {
  try {
    const storageKey = `${STORAGE_KEY_PREFIX}${sessionId}`;
    const data = {
      ...status,
      savedAt: Date.now()
    };
    localStorage.setItem(storageKey, JSON.stringify(data, (key, value) => {
      // Handle Date objects in nextRetryAt fields
      if (key === 'nextRetryAt' || key === 'createdAt' || key === 'sentAt') {
        return value instanceof Date ? value.toISOString() : value;
      }
      return value;
    }));
  } catch (error) {
    console.warn('Failed to save email status to localStorage:', error);
  }
}

/**
 * Load email queue status from localStorage
 */
export function loadEmailStatus(sessionId: string): PersistedEmailStatus | null {
  try {
    const storageKey = `${STORAGE_KEY_PREFIX}${sessionId}`;
    const stored = localStorage.getItem(storageKey);
    
    if (!stored) {
      return null;
    }

    const data = JSON.parse(stored, (key, value) => {
      // Restore Date objects
      if ((key === 'nextRetryAt' || key === 'createdAt' || key === 'sentAt') && typeof value === 'string') {
        return new Date(value);
      }
      return value;
    });

    // Check if data has expired
    const savedAt = data.savedAt || 0;
    const expiryTime = STORAGE_EXPIRY_HOURS * 60 * 60 * 1000; // Convert to milliseconds
    
    if (Date.now() - savedAt > expiryTime) {
      localStorage.removeItem(storageKey);
      return null;
    }

    return data;
  } catch (error) {
    console.warn('Failed to load email status from localStorage:', error);
    return null;
  }
}

/**
 * Clear email status from localStorage
 */
export function clearEmailStatus(sessionId: string): void {
  try {
    const storageKey = `${STORAGE_KEY_PREFIX}${sessionId}`;
    localStorage.removeItem(storageKey);
  } catch (error) {
    console.warn('Failed to clear email status from localStorage:', error);
  }
}

/**
 * List all persisted email sessions
 */
export function listEmailSessions(): string[] {
  try {
    const sessions: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
        const sessionId = key.replace(STORAGE_KEY_PREFIX, '');
        sessions.push(sessionId);
      }
    }
    return sessions;
  } catch (error) {
    console.warn('Failed to list email sessions:', error);
    return [];
  }
}

/**
 * Clean up expired email sessions
 */
export function cleanupExpiredSessions(): void {
  try {
    const sessions = listEmailSessions();
    
    sessions.forEach(sessionId => {
      const status = loadEmailStatus(sessionId);
      if (!status) {
        // Already expired and removed by loadEmailStatus
        return;
      }
      
      // Also clean up completed sessions older than 1 hour
      if (status.status === 'completed' && Date.now() - status.createdAt > 60 * 60 * 1000) {
        clearEmailStatus(sessionId);
      }
    });
  } catch (error) {
    console.warn('Failed to cleanup expired sessions:', error);
  }
}

/**
 * Generate a user-friendly session ID for display
 */
export function formatSessionId(sessionId: string): string {
  const timestamp = sessionId.replace('email-session-', '');
  const date = new Date(parseInt(timestamp));
  return date.toLocaleString();
}