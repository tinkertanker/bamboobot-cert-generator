/**
 * Types for progressive PDF generation
 */

export interface PdfQueueItem {
  id: string;
  index: number;
  data: Record<string, unknown>; // Certificate data
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  error?: string;
  outputPath?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface PdfQueue {
  sessionId: string;
  items: PdfQueueItem[];
  status: 'idle' | 'processing' | 'paused' | 'completed' | 'error';
  processed: number;
  failed: number;
  total: number;
  batchSize: number;
  currentBatch: number;
  totalBatches: number;
  startedAt?: Date;
  completedAt?: Date;
  templateFile: string;
  positions: Record<string, unknown>;
  uiContainerDimensions: { width: number; height: number };
  mode: 'individual' | 'bulk';
  namingColumn?: string;
}

export interface PdfGenerationProgress {
  sessionId: string;
  status: 'idle' | 'processing' | 'paused' | 'completed' | 'error';
  processed: number;
  failed: number;
  total: number;
  currentBatch: number;
  totalBatches: number;
  currentItem?: string;
  timeElapsed: number;
  estimatedTimeRemaining?: number;
  errors: Array<{ index: number; error: string }>;
}

export interface PdfGenerationResult {
  sessionId: string;
  status: 'completed' | 'partial';
  files: Array<{
    index: number;
    filename: string;
    path: string;
  }>;
  errors: Array<{
    index: number;
    error: string;
  }>;
  totalProcessed: number;
  totalFailed: number;
}

export interface PdfGenerationConfig {
  batchSize?: number;
  maxRetries?: number;
  sessionTimeout?: number; // in milliseconds
  storageProvider?: 'local' | 'r2';
}