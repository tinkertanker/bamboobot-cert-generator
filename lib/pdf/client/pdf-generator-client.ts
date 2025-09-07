/**
 * Client-side PDF generator
 * Main interface for generating PDFs in the browser
 */

import { FeatureDetector } from './feature-detection';
import { FontManager } from './font-manager';
import { ClientPdfQueueManager } from './pdf-queue-client';
import type { 
  WorkerRequest, 
  WorkerResponse, 
  GeneratePayload,
  Position,
  Entry 
} from './worker/worker-types';
import type { PdfGenerationProgress } from '../types';
import { PROGRESSIVE_PDF } from '@/utils/constants';

export interface ClientPdfOptions {
  enableFallback?: boolean;
  workerPath?: string;
  onProgress?: (progress: number, stage: string) => void;
  onError?: (error: Error) => void;
}

export interface GenerateOptions {
  templateUrl: string;
  entries: Entry[];
  positions: Record<string, Position>;
  uiContainerDimensions: { width: number; height: number };
  mode?: 'single' | 'individual';
  namingColumn?: string;
}

export interface GenerateResult {
  success: boolean;
  mode: 'single' | 'individual';
  data?: Uint8Array; // For single mode
  files?: Array<{ filename: string; data: Uint8Array; originalIndex: number }>; // For individual mode
  error?: Error;
}

export class ClientPdfGenerator {
  private static instance: ClientPdfGenerator;
  private worker: Worker | null = null;
  private featureDetector: FeatureDetector;
  private fontManager: FontManager;
  private workerPath: string;
  private pendingRequests: Map<string, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  }> = new Map();
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private queueManager: ClientPdfQueueManager | null = null;
  private onProgressCallback?: (progress: PdfGenerationProgress) => void;

  private constructor(options: ClientPdfOptions = {}) {
    this.featureDetector = FeatureDetector.getInstance();
    this.fontManager = FontManager.getInstance();
    this.workerPath = options.workerPath || '/pdf-worker.js';
  }

  static getInstance(options?: ClientPdfOptions): ClientPdfGenerator {
    if (!ClientPdfGenerator.instance) {
      ClientPdfGenerator.instance = new ClientPdfGenerator(options);
    }
    return ClientPdfGenerator.instance;
  }

  /**
   * Initialize the PDF generator
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._initialize();
    await this.initPromise;
    this.isInitialized = true;
  }

  private async _initialize(): Promise<void> {
    // Check browser capabilities
    const capabilities = await this.featureDetector.checkCapabilities();
    if (!capabilities.overallSupport) {
      throw new Error('Browser does not support client-side PDF generation');
    }

    // Initialize worker
    try {
      this.worker = new Worker(this.workerPath);
      
      // Set up message handler
      this.worker.addEventListener('message', this.handleWorkerMessage.bind(this));
      this.worker.addEventListener('error', this.handleWorkerError.bind(this));

      // Wait for worker to be ready
      await this.waitForWorkerReady();
    } catch (error) {
      throw new Error(`Failed to initialize PDF worker: ${error}`);
    }
  }

  /**
   * Wait for worker to signal it's ready
   */
  private waitForWorkerReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Worker initialization timeout'));
      }, 10000);

      const handler = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.type === 'ready') {
          clearTimeout(timeout);
          this.worker?.removeEventListener('message', handler);
          resolve();
        }
      };

      this.worker?.addEventListener('message', handler);
    });
  }

  /**
   * Handle messages from worker
   */
  private handleWorkerMessage(event: MessageEvent<WorkerResponse>) {
    const { type, id, payload } = event.data;
    const pending = this.pendingRequests.get(id);

    if (!pending) return;

    switch (type) {
      case 'complete':
        pending.resolve(payload);
        this.pendingRequests.delete(id);
        break;
      case 'error':
        pending.reject(new Error((payload as { message: string }).message));
        this.pendingRequests.delete(id);
        break;
      case 'progress':
        // Progress is handled via callback, not promise
        break;
    }
  }

  /**
   * Handle worker errors
   */
  private handleWorkerError(error: ErrorEvent) {
    console.error('Worker error:', error);
    // Reject all pending requests
    this.pendingRequests.forEach(pending => {
      pending.reject(new Error('Worker error: ' + error.message));
    });
    this.pendingRequests.clear();
  }

  /**
   * Check if client-side generation is supported
   */
  async isSupported(): Promise<boolean> {
    const capabilities = await this.featureDetector.checkCapabilities();
    return capabilities.overallSupport;
  }

  /**
   * Check if a specific data size can be handled
   */
  async canHandleDataSize(rowCount: number): Promise<boolean> {
    return this.featureDetector.canHandleDataSize(rowCount);
  }

  /**
   * Generate PDFs client-side
   */
  async generate(options: GenerateOptions): Promise<GenerateResult> {
    try {
      // Ensure initialized
      await this.initialize();

      // Load template
      const templateData = await this.loadTemplate(options.templateUrl);

      // Generate request ID
      const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      // Create promise for result
      const resultPromise = new Promise<GenerateResult>((resolve, reject) => {
        this.pendingRequests.set(requestId, { resolve, reject });
      });

      // Send to worker
      const request: WorkerRequest = {
        type: 'generate',
        id: requestId,
        payload: {
          templateData,
          entries: options.entries,
          positions: options.positions,
          uiContainerDimensions: options.uiContainerDimensions,
          mode: options.mode || 'single',
          namingColumn: options.namingColumn
        } as GeneratePayload
      };

      this.worker!.postMessage(request, [templateData]);

      // Wait for result
      const result = await resultPromise;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resultAny = result as any;
      return {
        success: true,
        mode: result.mode,
        data: resultAny.pdfData || resultAny.data,
        files: resultAny.files
      };
    } catch (error) {
      return {
        success: false,
        mode: options.mode || 'single',
        error: error instanceof Error ? error : new Error('Unknown error')
      };
    }
  }

  /**
   * Load template file
   */
  private async loadTemplate(url: string): Promise<ArrayBuffer> {
    // Handle blob URLs directly
    if (url.startsWith('blob:')) {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load blob template: ${response.statusText}`);
      }
      return response.arrayBuffer();
    }
    
    // Handle local paths (avoid CORS issues with remote URLs)
    if (url.startsWith('/')) {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load local template: ${response.statusText}`);
      }
      return response.arrayBuffer();
    }
    
    // Avoid fetching remote URLs to prevent CORS issues
    // Check for both http:// and https:// (case-insensitive)
    if (/^https?:\/\//i.test(url)) {
      throw new Error('Cannot load remote templates due to CORS. Please use local files or server-side generation.');
    }
    
    throw new Error(`Invalid template URL: ${url}`);
  }

  /**
   * Preload fonts for better performance
   */
  async preloadFonts(fonts: Array<{ family: string; bold?: boolean; italic?: boolean }>) {
    await this.initialize();
    
    const requestId = `preload-${Date.now()}`;
    const resultPromise = new Promise<void>((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });
    });

    this.worker!.postMessage({
      type: 'preloadFonts',
      id: requestId,
      payload: { fonts }
    } as WorkerRequest);

    await resultPromise;
  }

  /**
   * Generate PDFs with progressive/batch processing
   */
  async generateProgressive(options: GenerateOptions): Promise<{
    sessionId: string;
    queueManager: ClientPdfQueueManager;
  }> {
    await this.initialize();

    // Load template
    const templateData = await this.loadTemplate(options.templateUrl);
    
    // Create session ID
    const sessionId = `client-pdf-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    
    // Determine if we should use progressive generation
    const useProgressive = options.entries.length > PROGRESSIVE_PDF.AUTO_PROGRESSIVE_THRESHOLD;
    const batchSize = useProgressive ? PROGRESSIVE_PDF.DEFAULT_BATCH_SIZE : options.entries.length;
    
    // Create queue manager
    this.queueManager = new ClientPdfQueueManager(
      sessionId,
      templateData,
      options.positions,
      options.uiContainerDimensions,
      (options.mode === 'single' ? 'bulk' : 'individual') as 'individual' | 'bulk',
      { batchSize }
    );
    
    // Set progress callback if available
    if (this.onProgressCallback) {
      this.queueManager.setProgressCallback(this.onProgressCallback);
    }
    
    // Initialize queue with data
    await this.queueManager.initializeQueue(
      options.entries as unknown as Record<string, unknown>[],
      options.namingColumn
    );
    
    // Start processing
    await this.queueManager.startProcessing(this.worker!);
    
    return {
      sessionId,
      queueManager: this.queueManager
    };
  }

  /**
   * Set progress callback for progressive generation
   */
  setProgressCallback(callback: (progress: PdfGenerationProgress) => void): void {
    this.onProgressCallback = callback;
    if (this.queueManager) {
      this.queueManager.setProgressCallback(callback);
    }
  }

  /**
   * Pause progressive generation
   */
  async pauseProgressive(): Promise<void> {
    if (!this.queueManager) {
      throw new Error('No active progressive generation');
    }
    await this.queueManager.pause();
  }

  /**
   * Resume progressive generation
   */
  async resumeProgressive(): Promise<void> {
    if (!this.queueManager) {
      throw new Error('No active progressive generation');
    }
    await this.queueManager.resume(this.worker!);
  }

  /**
   * Cancel progressive generation
   */
  async cancelProgressive(): Promise<void> {
    if (!this.queueManager) {
      throw new Error('No active progressive generation');
    }
    await this.queueManager.cancel();
    this.queueManager = null;
  }

  /**
   * Get progress of current progressive generation
   */
  getProgressiveStatus(): PdfGenerationProgress | null {
    if (!this.queueManager) {
      return null;
    }
    return this.queueManager.getProgress();
  }

  /**
   * Get results of progressive generation
   */
  getProgressiveResults(): PdfGenerationProgress | null {
    if (!this.queueManager) {
      return null;
    }
    return this.queueManager.getResults() as unknown as PdfGenerationProgress;
  }

  /**
   * Get memory usage statistics
   */
  async getMemoryStats() {
    const memoryInfo = await this.featureDetector.getMemoryInfo();
    const cacheStats = this.fontManager.getCacheStats();
    
    return {
      memory: memoryInfo,
      fontCache: cacheStats,
      workerActive: this.worker !== null,
      queueActive: this.queueManager !== null
    };
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    if (this.queueManager) {
      this.queueManager.destroy();
      this.queueManager = null;
    }
    this.pendingRequests.clear();
    this.isInitialized = false;
    this.initPromise = null;
  }

  /**
   * Create a blob URL from PDF data
   */
  static createBlobUrl(pdfData: Uint8Array): string {
    const copy = new Uint8Array(pdfData);
    const blob = new Blob([copy], { type: 'application/pdf' });
    return URL.createObjectURL(blob);
  }

  /**
   * Download PDF to user's device
   */
  static downloadPdf(pdfData: Uint8Array, filename: string) {
    const url = this.createBlobUrl(pdfData);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Create a ZIP file from multiple PDFs (requires JSZip)
   */
  static async createZip(
    files: Array<{ filename: string; data: Uint8Array }>,
    JSZip: typeof import('jszip')
  ): Promise<Uint8Array> {
    const zip = new JSZip();
    
    files.forEach(file => {
      zip.file(file.filename, file.data);
    });
    
    return zip.generateAsync({ type: 'uint8array' });
  }
}
