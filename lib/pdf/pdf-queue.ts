import { v4 as uuidv4 } from 'uuid';
import type {
  PdfQueue,
  PdfQueueItem,
  PdfGenerationProgress,
  PdfGenerationResult,
  PdfGenerationConfig
} from './types';
import { PROGRESSIVE_PDF } from '@/utils/constants';

export class PdfQueueManager {
  private queue: PdfQueue;
  private config: Required<PdfGenerationConfig>;
  private processInterval: NodeJS.Timeout | null = null;
  private onProgress?: (progress: PdfGenerationProgress) => void;
  private lastActivity: number = Date.now();
  private startTime: number = 0;

  constructor(
    sessionId: string,
    templateFile: string,
    positions: Record<string, unknown>,
    uiContainerDimensions: { width: number; height: number },
    mode: 'individual' | 'bulk',
    config?: PdfGenerationConfig
  ) {
    this.config = {
      batchSize: config?.batchSize || PROGRESSIVE_PDF.DEFAULT_BATCH_SIZE,
      maxRetries: config?.maxRetries || PROGRESSIVE_PDF.MAX_RETRIES,
      sessionTimeout: config?.sessionTimeout || PROGRESSIVE_PDF.SESSION_TIMEOUT_MS,
      storageProvider: config?.storageProvider || 'local'
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
      templateFile,
      positions,
      uiContainerDimensions,
      mode
    };
  }

  /**
   * Initialize queue with certificate data
   */
  async initializeQueue(data: Record<string, unknown>[], namingColumn?: string): Promise<void> {
    const items: PdfQueueItem[] = data.map((item, index) => ({
      id: uuidv4(),
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
  }

  /**
   * Start processing the queue
   */
  async startProcessing(): Promise<void> {
    if (this.queue.status === 'processing') {
      return;
    }

    this.queue.status = 'processing';
    this.queue.startedAt = new Date();
    this.startTime = Date.now();
    this.lastActivity = Date.now();
    
    // Process queue will be called by the API endpoint
  }

  /**
   * Process next batch of PDFs
   */
  async processNextBatch(
    generatePdfFunc: (item: PdfQueueItem) => Promise<{ path: string; filename: string }>
  ): Promise<{ completed: PdfQueueItem[]; failed: PdfQueueItem[] }> {
    if (this.queue.status !== 'processing') {
      throw new Error('Queue is not in processing state');
    }

    // Get next batch of pending items
    const pendingItems = this.queue.items
      .filter(item => item.status === 'pending')
      .slice(0, this.config.batchSize);

    if (pendingItems.length === 0) {
      // Check if we have any items to retry
      const retryItems = this.queue.items
        .filter(item => item.status === 'failed' && item.attempts < this.config.maxRetries)
        .slice(0, this.config.batchSize);
      
      if (retryItems.length === 0) {
        // No more items to process
        this.queue.status = 'completed';
        this.queue.completedAt = new Date();
        return { completed: [], failed: [] };
      }
      
      pendingItems.push(...retryItems);
    }

    this.queue.currentBatch++;
    const completed: PdfQueueItem[] = [];
    const failed: PdfQueueItem[] = [];

    // Process items in the batch
    for (const item of pendingItems) {
      try {
        item.status = 'processing';
        item.attempts++;
        this.lastActivity = Date.now();

        // Call the PDF generation function
        const result = await generatePdfFunc(item);
        
        item.status = 'completed';
        item.outputPath = result.path;
        item.completedAt = new Date();
        this.queue.processed++;
        completed.push(item);

        // Report progress
        this._reportProgress(result.filename);
      } catch (error) {
        item.status = 'failed';
        item.error = error instanceof Error ? error.message : 'Unknown error';
        
        if (item.attempts >= this.config.maxRetries) {
          this.queue.failed++;
          failed.push(item);
        }
        
        console.error(`Failed to generate PDF for item ${item.index}:`, error);
      }
    }

    // Check if we're done
    const remainingItems = this.queue.items.filter(
      item => item.status === 'pending' || 
      (item.status === 'failed' && item.attempts < this.config.maxRetries)
    );

    if (remainingItems.length === 0) {
      this.queue.status = 'completed';
      this.queue.completedAt = new Date();
    }

    return { completed, failed };
  }

  /**
   * Pause queue processing
   */
  async pause(): Promise<void> {
    if (this.queue.status !== 'processing') {
      throw new Error('Queue is not processing');
    }
    
    this.queue.status = 'paused';
    this.lastActivity = Date.now();
  }

  /**
   * Resume queue processing
   */
  async resume(): Promise<void> {
    if (this.queue.status !== 'paused') {
      throw new Error('Queue is not paused');
    }
    
    this.queue.status = 'processing';
    this.lastActivity = Date.now();
  }

  /**
   * Cancel queue processing
   */
  async cancel(): Promise<void> {
    this.queue.status = 'error';
    this.lastActivity = Date.now();
    
    if (this.processInterval) {
      clearTimeout(this.processInterval);
      this.processInterval = null;
    }
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
      timeElapsed,
      estimatedTimeRemaining,
      errors
    };
  }

  /**
   * Get generation results
   */
  getResults(): PdfGenerationResult {
    const completedItems = this.queue.items.filter(item => item.status === 'completed');
    const failedItems = this.queue.items.filter(
      item => item.status === 'failed' && item.attempts >= this.config.maxRetries
    );

    const files = completedItems.map(item => ({
      index: item.index,
      filename: this._getFilenameForItem(item),
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
      totalFailed: this.queue.failed
    };
  }

  /**
   * Set progress callback
   */
  setProgressCallback(callback: (progress: PdfGenerationProgress) => void): void {
    this.onProgress = callback;
  }

  /**
   * Check if session is expired
   */
  isExpired(): boolean {
    return Date.now() - this.lastActivity > this.config.sessionTimeout;
  }

  /**
   * Get queue details
   */
  getQueue(): PdfQueue {
    return this.queue;
  }

  /**
   * Report progress
   */
  private _reportProgress(currentItem?: string): void {
    if (this.onProgress) {
      const progress = this.getProgress();
      progress.currentItem = currentItem;
      this.onProgress(progress);
    }
  }

  /**
   * Get filename for an item
   */
  private _getFilenameForItem(item: PdfQueueItem): string {
    if (this.queue.mode === 'bulk') {
      return 'certificates.pdf';
    }

    const baseFilename = this.queue.namingColumn && item.data[this.queue.namingColumn]
      ? String(item.data[this.queue.namingColumn])
      : `Certificate-${item.index + 1}`;

    // Sanitize filename
    return baseFilename.replace(/[^a-zA-Z0-9-_]/g, '_') + '.pdf';
  }
}