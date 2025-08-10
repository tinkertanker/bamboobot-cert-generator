/**
 * Type definitions for PDF worker communication
 * These types are shared between the main thread and worker threads
 */

import type { FontFamily } from '@/types/certificate';

// Message types for worker communication
export interface WorkerRequest {
  type: 'generate' | 'generateBatch' | 'preloadFonts';
  id: string;
  payload: unknown;
}

export interface WorkerResponse {
  type: 'progress' | 'complete' | 'error' | 'ready';
  id: string;
  payload: unknown;
}

export interface GeneratePayload {
  templateData: ArrayBuffer;
  entries: Entry[];
  positions: Record<string, Position>;
  uiContainerDimensions: { width: number; height: number };
  mode: 'single' | 'individual';
  namingColumn?: string;
}

export interface Position {
  fontSize?: number;
  x: number;
  y: number;
  font?: FontFamily;
  bold?: boolean;
  oblique?: boolean;
  alignment?: 'left' | 'center' | 'right';
  textMode?: 'shrink' | 'multiline';
  width?: number;
  lineHeight?: number;
}

export interface Entry {
  [key: string]: {
    text: string;
    color?: [number, number, number];
    font?: FontFamily;
    bold?: boolean;
    oblique?: boolean;
    uiMeasurements?: {
      width: number;
      height: number;
      actualHeight: number;
    };
  };
}

export interface FontVariant {
  family: FontFamily;
  bold: boolean;
  italic: boolean;
}