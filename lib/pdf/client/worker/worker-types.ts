/**
 * Type definitions for PDF worker communication
 * These types are shared between the main thread and worker threads
 */

import type { FontFamily } from '@/types/certificate';
import type { Position, Entry } from '@/lib/pdf/shared/pdf-generation-core';

// Message types for worker communication
export interface WorkerRequest {
  type: 'generate' | 'generateBatch' | 'preloadFonts';
  id: string;
  payload: unknown;
}

export interface WorkerResponse {
  type: 'progress' | 'file' | 'complete' | 'error' | 'ready' | 'parsed';
  id?: string;
  payload: unknown;
}

export interface WorkerFilePayload {
  filename: string;
  data: Uint8Array;
  originalIndex: number;
}

export interface GeneratePayload {
  templateData: ArrayBuffer;
  entries: Entry[];
  positions: Record<string, Position>;
  uiContainerDimensions: { width: number; height: number };
  mode: 'single' | 'individual';
  namingColumn?: string;
}

export type { Position, Entry };

export interface FontVariant {
  family: FontFamily;
  bold: boolean;
  italic: boolean;
}
