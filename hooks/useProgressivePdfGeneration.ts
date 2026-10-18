import { useState, useCallback, useRef, useEffect } from 'react';
import { DEFAULT_FONT_SIZE, PROGRESSIVE_PDF } from '@/utils/constants';
import type { TableData, Positions } from '@/types/certificate';
import type { PdfGenerationProgress, PdfGenerationResult } from '@/lib/pdf/types';
import { getFontReferenceDimensions } from '@/utils/fontScale';
import { MAX_PROGRESSIVE_BATCH_SIZE } from '@/lib/pdf/server-limits';
import { getPdfBaseFilename, UniquePdfFilenameAllocator } from '@/utils/pdf-filenames';

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createBatchId(): string {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, '');
  return random || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export interface UseProgressivePdfGenerationProps {
  tableData: TableData[];
  positions: Positions;
  uploadedFile: File | string | null;
  selectedNamingColumn: string;
  setSelectedNamingColumn: (column: string) => void;
}

export interface UseProgressivePdfGenerationReturn {
  isGenerating: boolean;
  progress: PdfGenerationProgress | null;
  results: PdfGenerationResult | null;
  error: string | null;
  startProgressiveGeneration: (mode: 'individual' | 'bulk', batchSize?: number, overrideFilename?: string) => Promise<void>;
  pauseGeneration: () => Promise<void>;
  resumeGeneration: () => Promise<void>;
  cancelGeneration: () => Promise<void>;
  clearResults: () => void;
}

export function useProgressivePdfGeneration({
  tableData,
  positions,
  uploadedFile,
  selectedNamingColumn,
  setSelectedNamingColumn
}: UseProgressivePdfGenerationProps): UseProgressivePdfGenerationReturn {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<PdfGenerationProgress | null>(null);
  const [results, setResults] = useState<PdfGenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Helper function to convert hex color to RGB array
  const hexToRgb = useCallback((hex: string): [number, number, number] => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? [
          parseInt(result[1], 16) / 255,
          parseInt(result[2], 16) / 255,
          parseInt(result[3], 16) / 255
        ]
      : [0, 0, 0]; // Default to black if parsing fails
  }, []);

  // Helper function to prepare data for API
  const prepareDataForApi = useCallback(() => {
    return tableData.map((row) => {
      const entry: {
        [key: string]: {
          text: string;
          color?: [number, number, number];
        };
      } = {};
      Object.keys(row).forEach((key) => {
        // Skip hidden fields
        if (positions[key]?.isVisible === false) {
          return;
        }

        const position = positions[key];
        entry[key] = {
          text: row[key],
          color: position?.color
            ? hexToRgb(position.color)
            : hexToRgb("#000000")
        };
      });
      return entry;
    });
  }, [tableData, positions, hexToRgb]);

  // Helper function to prepare positions for API
  const preparePositionsForApi = useCallback(() => {
    return Object.fromEntries(
      Object.entries(positions)
        .filter(([, pos]) => pos.isVisible !== false) // Filter out hidden fields
        .map(([key, pos]) => [
          key,
          {
            x: pos.x / 100,
            y: pos.y / 100,
            fontSize: pos.fontSize || DEFAULT_FONT_SIZE,
            font: pos.fontFamily || "Helvetica",
            bold: pos.bold || false,
            oblique: pos.italic || false,
            alignment: pos.alignment || "left",
            textMode: pos.textMode || "shrink",
            width: pos.width || 90,
            lineHeight: pos.lineHeight || 1.2
          }
        ])
    );
  }, [positions]);

  // Helper function to get container dimensions
  // Font sizes are relative to a fixed reference width, not the live preview
  const getContainerDimensions = useCallback(() => getFontReferenceDimensions(), []);

  // Run state lives in a ref so pause/resume/cancel reach the loop below
  // without re-rendering it. Each run gets a fresh object.
  const runRef = useRef<{
    id: string;
    paused: boolean;
    cancelled: boolean;
    wake: (() => void) | null;
    controller: AbortController | null;
  } | null>(null);

  // Start progressive generation: the browser sends one batch per request to
  // /api/generate-batch, so no job state is kept on the server.
  const startProgressiveGeneration = useCallback(async (
    mode: 'individual' | 'bulk',
    batchSize: number = PROGRESSIVE_PDF.DEFAULT_BATCH_SIZE,
    overrideFilename?: string
  ) => {
    setError(null);
    setProgress(null);
    setResults(null);

    if (mode !== 'individual') {
      setError('Batch generation only supports individual PDFs');
      return;
    }

    let templateFilename: string | undefined;
    if (overrideFilename) {
      templateFilename = overrideFilename;
    } else if (typeof uploadedFile === 'string') {
      templateFilename = uploadedFile;
    }
    if (!templateFilename) {
      setError('Upload the certificate template before generating');
      return;
    }

    // Set initial naming column if needed
    let namingColumn = selectedNamingColumn;
    if (tableData.length > 0 && !namingColumn) {
      namingColumn = Object.keys(tableData[0])[0];
      setSelectedNamingColumn(namingColumn);
    }

    const rows = prepareDataForApi();
    const apiPositions = preparePositionsForApi();
    const containerDimensions = getContainerDimensions();
    const allocator = new UniquePdfFilenameAllocator();
    const filenames = tableData.map((row, index) =>
      allocator.allocate(getPdfBaseFilename(namingColumn ? row[namingColumn] : undefined, `certificate_${index + 1}`))
    );

    const size = Math.min(Math.max(Math.floor(batchSize) || 1, 1), MAX_PROGRESSIVE_BATCH_SIZE);
    const total = rows.length;
    const totalBatches = Math.ceil(total / size);
    const runId = createBatchId();
    const run = { id: runId, paused: false, cancelled: false, wake: null as (() => void) | null, controller: null as AbortController | null };
    runRef.current = run;
    const startedAt = Date.now();

    const files: PdfGenerationResult['files'] = [];
    const errors: PdfGenerationResult['errors'] = [];
    let processed = 0;
    let failed = 0;

    const report = (status: PdfGenerationProgress['status'], currentBatch: number) => {
      if (runRef.current !== run) return;
      const timeElapsed = Date.now() - startedAt;
      const done = processed + failed;
      setProgress({
        sessionId: runId,
        status,
        processed,
        failed,
        total,
        currentBatch,
        totalBatches,
        timeElapsed,
        estimatedTimeRemaining: done > 0 ? Math.round((timeElapsed / done) * (total - done)) : undefined,
        errors: [...errors]
      });
    };

    setIsGenerating(true);
    report('processing', 0);

    for (let batch = 0; batch < totalBatches; batch += 1) {
      while (run.paused && !run.cancelled) {
        await new Promise<void>(resolve => { run.wake = resolve; });
      }
      if (run.cancelled) return;

      const startIndex = batch * size;
      const batchRows = rows.slice(startIndex, startIndex + size);
      report('processing', batch + 1);

      let lastError = 'PDF generation failed';
      let succeeded = false;
      for (let attempt = 0; attempt < PROGRESSIVE_PDF.MAX_RETRIES && !run.cancelled; attempt += 1) {
        run.controller = new AbortController();
        try {
          const response = await fetch('/api/generate-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: run.controller.signal,
            body: JSON.stringify({
              batchId: runId,
              startIndex,
              templateFilename,
              uiContainerDimensions: containerDimensions,
              data: batchRows,
              filenames: filenames.slice(startIndex, startIndex + size),
              positions: apiPositions
            })
          });
          if (response.ok) {
            const body = await response.json() as { files: PdfGenerationResult['files'] };
            files.push(...body.files);
            processed += batchRows.length;
            succeeded = true;
            break;
          }
          const body = await response.json().catch(() => ({})) as { error?: string };
          lastError = body.error || `Server returned ${response.status}`;
          // Only rate limits and server errors are worth retrying.
          if (response.status !== 429 && response.status < 500) break;
          const retryAfter = Number(response.headers.get('Retry-After'));
          await delay(response.status === 429 && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt);
        } catch (err) {
          if (run.cancelled) return;
          lastError = err instanceof Error ? err.message : 'Network error';
          await delay(1000 * 2 ** attempt);
        } finally {
          run.controller = null;
        }
      }
      if (run.cancelled) return;

      if (!succeeded) {
        failed += batchRows.length;
        batchRows.forEach((_, offset) => errors.push({ index: startIndex + offset, error: lastError }));
      }
      report(run.paused ? 'paused' : 'processing', batch + 1);
    }

    if (runRef.current !== run) return;
    const finalStatus = processed === 0 && failed > 0 ? 'error' : 'completed';
    report(finalStatus, totalBatches);
    setResults({
      sessionId: runId,
      status: failed > 0 ? 'partial' : 'completed',
      files,
      errors,
      totalProcessed: processed,
      totalFailed: failed
    });
    if (finalStatus === 'error') setError(errors[0]?.error || 'PDF generation failed');
    setIsGenerating(false);
  }, [
    uploadedFile,
    selectedNamingColumn,
    tableData,
    setSelectedNamingColumn,
    getContainerDimensions,
    prepareDataForApi,
    preparePositionsForApi
  ]);

  const pauseGeneration = useCallback(async () => {
    const run = runRef.current;
    if (!run || run.cancelled) return;
    run.paused = true;
    setProgress(prev => (prev ? { ...prev, status: 'paused' } : prev));
  }, []);

  const resumeGeneration = useCallback(async () => {
    const run = runRef.current;
    if (!run || run.cancelled) return;
    run.paused = false;
    run.wake?.();
    run.wake = null;
    setProgress(prev => (prev ? { ...prev, status: 'processing' } : prev));
  }, []);

  const cancelGeneration = useCallback(async () => {
    const run = runRef.current;
    if (!run) return;
    run.cancelled = true;
    run.controller?.abort();
    run.wake?.();
    runRef.current = null;
    setIsGenerating(false);
  }, []);

  const clearResults = useCallback(() => {
    const run = runRef.current;
    if (run) {
      run.cancelled = true;
      run.controller?.abort();
      run.wake?.();
      runRef.current = null;
    }
    setProgress(null);
    setResults(null);
    setError(null);
    setIsGenerating(false);
  }, []);

  // Stop any running batch loop on unmount
  useEffect(() => {
    return () => {
      const run = runRef.current;
      if (run) {
        run.cancelled = true;
        run.controller?.abort();
        run.wake?.();
      }
    };
  }, []);

  return {
    isGenerating,
    progress,
    results,
    error,
    startProgressiveGeneration,
    pauseGeneration,
    resumeGeneration,
    cancelGeneration,
    clearResults
  };
}
