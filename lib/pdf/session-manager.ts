import { PdfQueueManager } from './pdf-queue';
import type { PdfGenerationConfig } from './types';
import { PROGRESSIVE_PDF } from '@/utils/constants';

/**
 * Manages multiple PDF generation sessions
 */
export class PdfSessionManager {
  private static instance: PdfSessionManager;
  private sessions: Map<string, PdfQueueManager> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private removalListeners = new Set<(sessionId: string) => void>();

  private constructor() {
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, PROGRESSIVE_PDF.CLEANUP_INTERVAL_MS);
  }

  /**
   * Get singleton instance
   */
  static getInstance(): PdfSessionManager {
    if (!PdfSessionManager.instance) {
      PdfSessionManager.instance = new PdfSessionManager();
    }
    return PdfSessionManager.instance;
  }

  /**
   * Create a new PDF generation session
   */
  createSession(
    sessionId: string,
    templateFile: string,
    positions: Record<string, unknown>,
    uiContainerDimensions: { width: number; height: number },
    mode: 'individual' | 'bulk',
    config?: PdfGenerationConfig
  ): PdfQueueManager {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} already exists`);
    }

    const queueManager = new PdfQueueManager(
      sessionId,
      templateFile,
      positions,
      uiContainerDimensions,
      mode,
      config
    );

    this.sessions.set(sessionId, queueManager);
    return queueManager;
  }

  /**
   * Get an existing session
   */
  getSession(sessionId: string): PdfQueueManager | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Remove a session
   */
  removeSession(sessionId: string): void {
    if (this.sessions.delete(sessionId)) {
      for (const listener of this.removalListeners) listener(sessionId);
    }
  }

  onSessionRemoved(listener: (sessionId: string) => void): () => void {
    this.removalListeners.add(listener);
    return () => this.removalListeners.delete(listener);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions(): void {
    console.log('Cleaning up expired PDF generation sessions...');
    let cleaned = 0;

    for (const [sessionId, manager] of this.sessions.entries()) {
      if (manager.isExpired()) {
        this.removeSession(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`Cleaned up ${cleaned} expired PDF generation sessions`);
    }
  }

  /**
   * Destroy the session manager
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    for (const sessionId of this.sessions.keys()) this.removeSession(sessionId);
    this.removalListeners.clear();
  }
}
