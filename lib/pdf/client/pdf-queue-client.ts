/**
 * Client-side PDF queue manager
 * Adapted from server-side progressive generation for browser environment
 */

import type {
  PdfQueue,
  PdfQueueItem,
  PdfGenerationProgress,
  PdfGenerationResult,
  PdfGenerationConfig
} from '../types';
import { PROGRESSIVE_PDF } from '@/utils/constants';

export class ClientPdfQueueManager {
  private queue: PdfQueue;
  private config: Required<PdfGenerationConfig>;
  private processingTimer: number | null = null;
  private lastActivity: number = Date.now();
  private startTime: number = 0;
  private worker: Worker | null = null;
  private currentProcessingItem: PdfQueueItem | null = null;
  private generatedPdfs: Map<string, Uint8Array> = new Map();
  private isPausing = false;
  private onProgressCallback?: (progress: PdfGenerationProgress) => void;

  constructor(
    sessionId: string,
    templateData: ArrayBuffer,
    positions: Record<string, unknown>,
    uiContainerDimensions: { width: number; height: number },
    mode: 'individual' | 'bulk',
    config?: PdfGenerationConfig
  ) {
    this.config = {
      batchSize: config?.batchSize || PROGRESSIVE_PDF.DEFAULT_BATCH_SIZE,
      maxRetries: config?.maxRetries || PROGRESSIVE_PDF.MAX_RETRIES,
      sessionTimeout: config?.sessionTimeout || PROGRESSIVE_PDF.SESSION_TIMEOUT_MS,
      storageProvider: 'local' // Always local for client-side
    };

    this.queue = {
      sessionId,
      items: [],
      status: 'idle',
      processed: 0,
      failed: 0,
      total: 0,
      batchSize: this.config.batchSize,
      currentBatch: 0,
      totalBatches: 0,
      templateFile: '', // Not used in client-side
      positions,
      uiContainerDimensions,
      mode
    };

    // Store template data for reuse
    this.storeTemplateData(templateData);
  }

  /**
   * Store template data in IndexedDB for reuse
   */
  private async storeTemplateData(templateData: ArrayBuffer): Promise<void> {
    try {
      const db = await this.openDatabase();
      const tx = db.transaction(['templates'], 'readwrite');
      const store = tx.objectStore('templates');
      store.put({
        sessionId: this.queue.sessionId,
        data: templateData,
        timestamp: Date.now()
      });
    } catch (error) {
      console.warn('Failed to store template in IndexedDB:', error);
    }
  }

  /**
   * Get template data from IndexedDB
   */
  private async getTemplateData(): Promise<ArrayBuffer | null> {
    try {
      const db = await this.openDatabase();
      const tx = db.transaction(['templates'], 'readonly');
      const store = tx.objectStore('templates');
      const request = store.get(this.queue.sessionId);
      
      return new Promise((resolve) => {
        request.onsuccess = () => {
          const result = request.result;
          resolve(result?.data || null);
        };
        request.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /**
   * Open IndexedDB for storage
   */
  private async openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('pdf-queue-db', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('templates')) {
          db.createObjectStore('templates', { keyPath: 'sessionId' });
        }
        if (!db.objectStoreNames.contains('results')) {
          db.createObjectStore('results', { keyPath: 'id' });
        }
      };
    });
  }

  /**
   * Initialize queue with certificate data
   */
  async initializeQueue(data: Record<string, unknown>[], namingColumn?: string): Promise<void> {
    const items: PdfQueueItem[] = data.map((item, index) => ({
      id: `${this.queue.sessionId}-${index}`,
      index,
      data: item,
      status: 'pending',
      attempts: 0,
      createdAt: new Date()
    }));

    this.queue.items = items;
    this.queue.total = items.length;
    this.queue.totalBatches = Math.ceil(items.length / this.config.batchSize);
    this.queue.namingColumn = namingColumn;
    this.lastActivity = Date.now();

    // Save queue state to localStorage for persistence
    this.saveQueueState();
  }

  /**
   * Start processing the queue
   */
  async startProcessing(worker: Worker): Promise<void> {
    if (this.queue.status === 'processing') {
      return;
    }

    this.worker = worker;
    this.queue.status = 'processing';
    this.queue.startedAt = new Date();
    this.startTime = Date.now();
    this.lastActivity = Date.now();
    this.isPausing = false;
    
    // Start processing batches
    this.processNextBatch();
  }

  /**
   * Process next batch of PDFs
   */
  private async processNextBatch(): Promise<void> {
    if (this.queue.status !== 'processing' || this.isPausing) {
      return;
    }

    // Get next batch of pending items
    const pendingItems = this.queue.items
      .filter(item => item.status === 'pending')
      .slice(0, this.config.batchSize);

    if (pendingItems.length === 0) {
      // Check for retry items
      const retryItems = this.queue.items
        .filter(item => item.status === 'failed' && item.attempts < this.config.maxRetries)
        .slice(0, this.config.batchSize);
      
      if (retryItems.length === 0) {
        // No more items to process
        this.completeProcessing();
        return;
      }
      
      pendingItems.push(...retryItems);
    }

    this.queue.currentBatch++;
    
    // Process items one by one (could be parallelized in future)
    for (const item of pendingItems) {
      if (this.isPausing) break;
      
      await this.processItem(item);
    }

    // Save state after batch
    this.saveQueueState();

    // Schedule next batch
    if (!this.isPausing && this.queue.status === 'processing') {
      this.processingTimer = window.setTimeout(() => {
        this.processNextBatch();
      }, 100); // Small delay to prevent blocking UI
    }
  }

  /**
   * Process a single item
   */
  private async processItem(item: PdfQueueItem): Promise<void> {
    try {
      item.status = 'processing';
      item.attempts++;
      this.currentProcessingItem = item;
      this.lastActivity = Date.now();

      const templateData = await this.getTemplateData();
      if (!templateData) {
        throw new Error('Template data not found');
      }

      // Send to worker for processing
      const result = await this.generatePdfInWorker(templateData, item);
      
      // Store result
      const filename = this.getFilenameForItem(item);
      this.generatedPdfs.set(filename, result);
      
      item.status = 'completed';
      item.outputPath = filename;
      item.completedAt = new Date();
      this.queue.processed++;
      
      // Report progress
      this.reportProgress(filename);
    } catch (error) {
      item.status = 'failed';
      item.error = error instanceof Error ? error.message : 'Unknown error';
      
      if (item.attempts >= this.config.maxRetries) {
        this.queue.failed++;
      }
      
      console.error(`Failed to generate PDF for item ${item.index}:`, error);
    } finally {
      this.currentProcessingItem = null;
    }
  }

  /**
   * Generate PDF using worker
   */
  private generatePdfInWorker(
    templateData: ArrayBuffer,
    item: PdfQueueItem
  ): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker not initialized'));
        return;
      }

      const requestId = `generate-${item.id}`;
      
      const handler = (event: MessageEvent) => {
        if (event.data.id === requestId) {
          if (event.data.type === 'complete') {
            this.worker?.removeEventListener('message', handler);
            resolve(event.data.payload.pdfData || event.data.payload.files?.[0]?.data);
          } else if (event.data.type === 'error') {
            this.worker?.removeEventListener('message', handler);
            reject(new Error(event.data.payload.message));
          }
        }
      };

      this.worker.addEventListener('message', handler);

      // Send generation request to worker
      this.worker.postMessage({
        type: 'generate',
        id: requestId,
        payload: {
          templateData,
          entries: [item.data],
          positions: this.queue.positions,
          uiContainerDimensions: this.queue.uiContainerDimensions,
          mode: 'single'
        }
      }, [templateData.slice(0)]); // Transfer copy of template data
    });
  }

  /**
   * Complete processing
   */
  private completeProcessing(): void {
    this.queue.status = 'completed';
    this.queue.completedAt = new Date();
    this.saveQueueState();
    this.reportProgress();
  }

  /**
   * Pause queue processing
   */
  async pause(): Promise<void> {
    if (this.queue.status !== 'processing') {
      throw new Error('Queue is not processing');
    }
    
    this.isPausing = true;
    this.queue.status = 'paused';
    this.lastActivity = Date.now();
    
    if (this.processingTimer) {
      clearTimeout(this.processingTimer);
      this.processingTimer = null;
    }
    
    this.saveQueueState();
  }

  /**
   * Resume queue processing
   */
  async resume(worker?: Worker): Promise<void> {
    if (this.queue.status !== 'paused') {
      throw new Error('Queue is not paused');
    }
    
    if (worker) {
      this.worker = worker;
    }
    
    this.queue.status = 'processing';
    this.isPausing = false;
    this.lastActivity = Date.now();
    this.saveQueueState();
    
    // Resume processing
    this.processNextBatch();
  }

  /**
   * Cancel queue processing
   */
  async cancel(): Promise<void> {
    this.queue.status = 'error';
    this.isPausing = true;
    this.lastActivity = Date.now();
    
    if (this.processingTimer) {
      clearTimeout(this.processingTimer);
      this.processingTimer = null;
    }
    
    // Clear generated PDFs to free memory
    this.generatedPdfs.clear();
    
    this.saveQueueState();
  }

  /**
   * Get current progress
   */
  getProgress(): PdfGenerationProgress {
    const timeElapsed = this.startTime ? Date.now() - this.startTime : 0;
    const itemsPerSecond = this.queue.processed / (timeElapsed / 1000) || 0;
    const remainingItems = this.queue.total - this.queue.processed - this.queue.failed;
    const estimatedTimeRemaining = itemsPerSecond > 0 
      ? (remainingItems / itemsPerSecond) * 1000
      : undefined;

    const errors = this.queue.items
      .filter(item => item.status === 'failed' && item.attempts >= this.config.maxRetries)
      .map(item => ({
        index: item.index,
        error: item.error || 'Unknown error'
      }));

    return {
      sessionId: this.queue.sessionId,
      status: this.queue.status,
      processed: this.queue.processed,
      failed: this.queue.failed,
      total: this.queue.total,
      currentBatch: this.queue.currentBatch,
      totalBatches: this.queue.totalBatches,
      currentItem: this.currentProcessingItem ? this.getFilenameForItem(this.currentProcessingItem) : undefined,
      timeElapsed,
      estimatedTimeRemaining,
      errors
    };
  }

  /**
   * Get generation results
   */
  getResults(): PdfGenerationResult & { pdfs: Map<string, Uint8Array> } {
    const completedItems = this.queue.items.filter(item => item.status === 'completed');
    const failedItems = this.queue.items.filter(
      item => item.status === 'failed' && item.attempts >= this.config.maxRetries
    );

    const files = completedItems.map(item => ({
      index: item.index,
      filename: this.getFilenameForItem(item),
      path: item.outputPath || ''
    }));

    const errors = failedItems.map(item => ({
      index: item.index,
      error: item.error || 'Unknown error'
    }));

    return {
      sessionId: this.queue.sessionId,
      status: this.queue.status === 'completed' ? 'completed' : 'partial',
      files,
      errors,
      totalProcessed: this.queue.processed,
      totalFailed: this.queue.failed,
      pdfs: this.generatedPdfs
    };
  }

  /**
   * Set progress callback
   */
  setProgressCallback(callback: (progress: PdfGenerationProgress) => void): void {
    this.onProgressCallback = callback;
  }

  /**
   * Save queue state to localStorage
   */
  private saveQueueState(): void {
    try {
      const state = {
        queue: this.queue,
        lastActivity: this.lastActivity,
        startTime: this.startTime
      };
      localStorage.setItem(`pdf-queue-${this.queue.sessionId}`, JSON.stringify(state));
    } catch (error) {
      console.warn('Failed to save queue state:', error);
    }
  }

  /**
   * Load queue state from localStorage
   */
  static loadQueueState(sessionId: string): any | null {
    try {
      const saved = localStorage.getItem(`pdf-queue-${sessionId}`);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  }

  /**
   * Report progress
   */
  private reportProgress(currentItem?: string): void {
    if (this.onProgressCallback) {
      const progress = this.getProgress();
      if (currentItem) {
        progress.currentItem = currentItem;
      }
      this.onProgressCallback(progress);
    }
  }

  /**
   * Get filename for an item
   */
  private getFilenameForItem(item: PdfQueueItem): string {
    if (this.queue.mode === 'bulk') {
      return 'certificates.pdf';
    }

    const baseFilename = this.queue.namingColumn && item.data[this.queue.namingColumn]
      ? String(item.data[this.queue.namingColumn])
      : `Certificate-${item.index + 1}`;

    // Sanitize filename
    return baseFilename.replace(/[^a-zA-Z0-9-_]/g, '_') + '.pdf';
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.processingTimer) {
      clearTimeout(this.processingTimer);
      this.processingTimer = null;
    }
    this.generatedPdfs.clear();
    this.worker = null;
  }
}