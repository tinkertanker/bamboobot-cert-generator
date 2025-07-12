import { useState, useCallback, useRef, useEffect } from 'react';
import { DEFAULT_FONT_SIZE, PROGRESSIVE_PDF } from '@/utils/constants';
import { measureText } from '@/utils/textMeasurement';
import type { TableData, Positions } from '@/types/certificate';
import type { PdfGenerationProgress, PdfGenerationResult } from '@/lib/pdf/types';

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
  startProgressiveGeneration: (mode: 'individual' | 'bulk', batchSize?: number) => Promise<void>;
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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
          uiMeasurements?: {
            width: number;
            height: number;
            actualHeight: number;
          };
        };
      } = {};
      Object.keys(row).forEach((key) => {
        // Skip hidden fields
        if (positions[key]?.isVisible === false) {
          return;
        }

        const fontSize = DEFAULT_FONT_SIZE;
        const measurements = measureText(row[key], fontSize, "500");
        const position = positions[key];
        entry[key] = {
          text: row[key],
          color: position?.color
            ? hexToRgb(position.color)
            : hexToRgb("#000000"),
          uiMeasurements: measurements
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
            alignment: pos.alignment || "left"
          }
        ])
    );
  }, [positions]);

  // Helper function to get container dimensions
  const getContainerDimensions = useCallback(() => {
    const containerElement = document.querySelector(
      ".image-container img"
    ) as HTMLImageElement;
    return containerElement
      ? {
          width: containerElement.offsetWidth,
          height: containerElement.offsetHeight
        }
      : { width: 600, height: 400 }; // Fallback dimensions
  }, []);

  // Poll for progress updates
  const pollProgress = useCallback(async (sessionId: string) => {
    try {
      const response = await fetch(`/api/generate-progressive?sessionId=${sessionId}`);
      if (!response.ok) {
        throw new Error('Failed to get progress');
      }

      const data = await response.json();
      setProgress(data);

      // If generation is complete or errored, stop polling and set results
      if (data.status === 'completed' || data.status === 'error') {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        setIsGenerating(false);
        
        if (data.results) {
          setResults(data.results);
        }
        
        if (data.status === 'error') {
          setError('PDF generation failed');
        }
      }
    } catch (err) {
      console.error('Error polling progress:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsGenerating(false);
      
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }
  }, []);

  // Start progressive generation
  const startProgressiveGeneration = useCallback(async (
    mode: 'individual' | 'bulk',
    batchSize = 20
  ) => {
    setIsGenerating(true);
    setError(null);
    setProgress(null);
    setResults(null);

    try {
      const containerDimensions = getContainerDimensions();

      const response = await fetch('/api/generate-progressive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          mode,
          templateFilename: typeof uploadedFile === 'string' ? uploadedFile : uploadedFile?.name,
          uiContainerDimensions: containerDimensions,
          namingColumn: selectedNamingColumn,
          data: prepareDataForApi(),
          positions: preparePositionsForApi(),
          batchSize
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start PDF generation');
      }

      const data = await response.json();
      setSessionId(data.sessionId);

      // Set initial naming column if needed
      if (mode === 'individual' && tableData.length > 0 && !selectedNamingColumn) {
        setSelectedNamingColumn(Object.keys(tableData[0])[0]);
      }

      // Start polling for progress
      pollIntervalRef.current = setInterval(() => {
        pollProgress(data.sessionId);
      }, PROGRESSIVE_PDF.POLL_INTERVAL_MS);

      // Do initial poll immediately
      pollProgress(data.sessionId);
    } catch (err) {
      console.error('Error starting progressive generation:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsGenerating(false);
    }
  }, [
    uploadedFile,
    selectedNamingColumn,
    tableData,
    setSelectedNamingColumn,
    getContainerDimensions,
    prepareDataForApi,
    preparePositionsForApi,
    pollProgress
  ]);

  // Pause generation
  const pauseGeneration = useCallback(async () => {
    if (!sessionId) return;

    try {
      const response = await fetch(`/api/generate-progressive?sessionId=${sessionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'pause' })
      });

      if (!response.ok) {
        throw new Error('Failed to pause generation');
      }

      // Stop polling while paused
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    } catch (err) {
      console.error('Error pausing generation:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [sessionId]);

  // Resume generation
  const resumeGeneration = useCallback(async () => {
    if (!sessionId) return;

    try {
      const response = await fetch(`/api/generate-progressive?sessionId=${sessionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'resume' })
      });

      if (!response.ok) {
        throw new Error('Failed to resume generation');
      }

      // Resume polling
      pollIntervalRef.current = setInterval(() => {
        pollProgress(sessionId);
      }, PROGRESSIVE_PDF.POLL_INTERVAL_MS);
    } catch (err) {
      console.error('Error resuming generation:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [sessionId, pollProgress]);

  // Cancel generation
  const cancelGeneration = useCallback(async () => {
    if (!sessionId) return;

    try {
      const response = await fetch(`/api/generate-progressive?sessionId=${sessionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'cancel' })
      });

      if (!response.ok) {
        throw new Error('Failed to cancel generation');
      }

      // Stop polling
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }

      setIsGenerating(false);
      setSessionId(null);
    } catch (err) {
      console.error('Error cancelling generation:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [sessionId]);

  // Clear results
  const clearResults = useCallback(() => {
    setProgress(null);
    setResults(null);
    setError(null);
    setSessionId(null);
    setIsGenerating(false);
    
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
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