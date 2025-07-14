/**
 * Session Storage Module
 * 
 * Handles saving and loading the current session data including table data.
 * This is separate from templates which are reusable formats without data.
 */

import type { TableData } from '@/types/certificate';

export interface SessionData {
  tableData: TableData[];
  tableInput: string;
  isFirstRowHeader: boolean;
  useCSVMode: boolean;
  lastModified: string;
}

const SESSION_KEY = 'bamboobot_current_session_v1';
const MAX_SESSION_SIZE = 2 * 1024 * 1024; // 2MB limit for session data

export class SessionStorage {
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
      
      // Validate session structure
      if (!session.tableData || !Array.isArray(session.tableData)) {
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
      
      const lastModified = new Date(session.lastModified);
      return Date.now() - lastModified.getTime();
    } catch (error) {
      console.error('Error getting session age:', error);
      return null;
    }
  }
}