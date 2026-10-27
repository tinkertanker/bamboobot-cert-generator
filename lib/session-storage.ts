/**
 * Session Storage Module
 * 
 * Handles saving and loading the current session data including table data.
 * This is separate from templates which are reusable formats without data.
 */

import type { TableData } from '@/types/certificate';
import { v4 as uuidv4 } from 'uuid';
import { OWNER_KEY, QUARANTINE_PREFIX } from '@/lib/storage/account-scope';

export interface SessionData {
  tableData: TableData[];
  tableInput: string;
  isFirstRowHeader: boolean;
  useCSVMode: boolean;
  lastModified: string;
}

const SESSION_KEY = 'bamboobot_current_session_v1';
const MAX_SESSION_SIZE = 2 * 1024 * 1024; // 2MB limit for session data
// Still opaque to generic inspection/cleanup and all automatic restore readers.
const OWNED_SESSION_PREFIX = `${QUARANTINE_PREFIX}session_v1_`;

function requireRecoveryOwner(userId: string): void {
  if (!userId || localStorage.getItem(OWNER_KEY) !== userId) {
    throw new Error('Recovery requires the original signed-in account and browser ownership');
  }
}

function ownedSession(raw: string | null, userId: string): string | null {
  if (raw === null) return null;
  try {
    const record = JSON.parse(raw);
    return record?.version === 1 && record.ownerId === userId && typeof record.session === 'string'
      ? record.session : null;
  } catch {
    return null;
  }
}

export class SessionStorage {
  /**
   * Preserve rejected working data outside restoration and cleanup readers.
   * Callers may bind NEW copies only to the authenticated owner of active data.
   * Old unowned archives are never relabelled, even if their bytes match.
   */
  static archiveSession(userId?: string): boolean {
    try {
      if (userId !== undefined) requireRecoveryOwner(userId);
      const original = localStorage.getItem(SESSION_KEY);
      if (original === null) return true;
      const archive = JSON.stringify(userId === undefined
        ? { [SESSION_KEY]: original }
        : { version: 1, ownerId: userId, session: original });
      const prefix = userId === undefined ? QUARANTINE_PREFIX : OWNED_SESSION_PREFIX;
      // A rejected session may remain active when no saved project replaces it.
      // Reuse verified bytes instead of consuming more storage on every reload.
      for (let i = 0; i < localStorage.length; i++) {
        const existingKey = localStorage.key(i);
        if (existingKey?.startsWith(prefix) && localStorage.getItem(existingKey) === archive) {
          if (userId !== undefined) requireRecoveryOwner(userId);
          return true;
        }
      }
      if (userId !== undefined) requireRecoveryOwner(userId);
      const key = `${prefix}${uuidv4()}`;
      localStorage.setItem(key, archive);
      if (userId !== undefined) requireRecoveryOwner(userId);
      return localStorage.getItem(key) === archive;
    } catch {
      return false;
    }
  }

  /** The caller must independently authenticate userId; the marker is not login. */
  static listRecoverySessions(userId: string): string[] {
    requireRecoveryOwner(userId);
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(OWNED_SESSION_PREFIX) && ownedSession(localStorage.getItem(key), userId) !== null) {
        keys.push(key);
      }
    }
    requireRecoveryOwner(userId);
    return keys.sort();
  }

  static readRecoverySession(key: string, userId: string): string {
    requireRecoveryOwner(userId);
    const session = key.startsWith(OWNED_SESSION_PREFIX)
      ? ownedSession(localStorage.getItem(key), userId) : null;
    requireRecoveryOwner(userId);
    if (session === null) throw new Error('Recovery copy is unavailable for this account');
    return session;
  }

  /**
   * Save current session data
   */
  static saveSession(data: Omit<SessionData, 'lastModified'>): boolean {
    try {
      const sessionData: SessionData = {
        ...data,
        lastModified: new Date().toISOString()
      };
      
      const serialized = JSON.stringify(sessionData);
      
      // Check size limit
      if (serialized.length > MAX_SESSION_SIZE) {
        console.warn('Session data too large to save');
        return false;
      }
      
      localStorage.setItem(SESSION_KEY, serialized);
      return true;
    } catch (error) {
      console.error('Error saving session:', error);
      return false;
    }
  }
  
  /**
   * Load saved session data
   */
  static loadSession(): SessionData | null {
    try {
      const data = localStorage.getItem(SESSION_KEY);
      if (!data) return null;
      
      const session = JSON.parse(data) as SessionData;

      // Validate the full session shape; saveSession always writes every field.
      if (
        !session ||
        typeof session !== 'object' ||
        !Array.isArray(session.tableData) ||
        typeof session.tableInput !== 'string' ||
        typeof session.isFirstRowHeader !== 'boolean' ||
        typeof session.useCSVMode !== 'boolean' ||
        typeof session.lastModified !== 'string'
      ) {
        console.error('Invalid session data structure');
        return null;
      }

      return session;
    } catch (error) {
      console.error('Error loading session:', error);
      return null;
    }
  }
  
  /**
   * Clear session data
   */
  static clearSession(): void {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (error) {
      console.error('Error clearing session:', error);
    }
  }
  
  /**
   * Get session age in milliseconds
   */
  static getSessionAge(): number | null {
    try {
      const session = this.loadSession();
      if (!session) return null;
      
      const lastModified = new Date(session.lastModified).getTime();
      if (!Number.isFinite(lastModified)) return null;
      return Date.now() - lastModified;
    } catch (error) {
      console.error('Error getting session age:', error);
      return null;
    }
  }
}
