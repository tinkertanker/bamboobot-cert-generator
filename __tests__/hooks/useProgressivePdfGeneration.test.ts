import { renderHook, act, waitFor } from '@testing-library/react';
import { useProgressivePdfGeneration } from '@/hooks/useProgressivePdfGeneration';
import type { TableData, Positions } from '@/types/certificate';
import type { PdfGenerationProgress, PdfGenerationResult } from '@/lib/pdf/types';

// Mock the measureText utility
jest.mock('@/utils/textMeasurement', () => ({
  measureText: jest.fn(() => ({
    width: 100,
    height: 20,
    actualHeight: 18
  }))
}));

// Mock fetch
global.fetch = jest.fn();

describe('useProgressivePdfGeneration', () => {
  const mockSetSelectedNamingColumn = jest.fn();
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  const mockTableData: TableData[] = [
    { name: 'John Doe', title: 'Certificate of Excellence' },
    { name: 'Jane Smith', title: 'Achievement Award' }
  ];

  const mockPositions: Positions = {
    name: { x: 50, y: 30, fontSize: 24, fontFamily: 'Helvetica', color: '#FF0000' },
    title: { x: 50, y: 70, fontSize: 18, fontFamily: 'Times', isVisible: false }
  };

  const mockUploadedFile = new File(['content'], 'template.pdf', { type: 'application/pdf' });

  const defaultProps = {
    tableData: mockTableData,
    positions: mockPositions,
    uploadedFile: mockUploadedFile,
    selectedNamingColumn: 'name',
    setSelectedNamingColumn: mockSetSelectedNamingColumn
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Mock DOM element for container dimensions
    const mockImg = document.createElement('img');
    Object.defineProperty(mockImg, 'offsetWidth', { value: 800 });
    Object.defineProperty(mockImg, 'offsetHeight', { value: 600 });
    
    document.body.innerHTML = '<div class="image-container"><img /></div>';
    const container = document.querySelector('.image-container');
    container?.appendChild(mockImg);
  });

  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  describe('Initial State', () => {
    it('initializes with correct default values', () => {
      const { result } = renderHook(() => useProgressivePdfGeneration(defaultProps));
      
      expect(result.current.isGenerating).toBe(false);
      expect(result.current.progress).toBeNull();
      expect(result.current.results).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe('startProgressiveGeneration', () => {
    it('starts generation for individual mode', async () => {
      const mockSessionId = 'test-session-123';
      const mockInitialProgress: PdfGenerationProgress = {
        sessionId: mockSessionId,
        status: 'processing',
        processed: 0,
        failed: 0,
        total: 2,
        currentBatch: 1,
        totalBatches: 1,
        timeElapsed: 0,
        errors: []
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessionId: mockSessionId })
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockInitialProgress
      } as Response);

      const { result } = renderHook(() => useProgressivePdfGeneration(defaultProps));

      await act(async () => {
        await result.current.startProgressiveGeneration('individual');
      });

      expect(result.current.isGenerating).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('/api/generate-progressive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'individual',
          templateFilename: 'template.pdf',
          uiContainerDimensions: { width: 800, height: 600 },
          namingColumn: 'name',
          data: [
            {
              name: {
                text: 'John Doe',
                color: [1, 0, 0],
                uiMeasurements: { width: 100, height: 20, actualHeight: 18 }
              }
            },
            {
              name: {
                text: 'Jane Smith',
                color: [1, 0, 0],
                uiMeasurements: { width: 100, height: 20, actualHeight: 18 }
              }
            }
          ],
          positions: {
            name: {
              x: 0.5,
              y: 0.3,
              fontSize: 24,
              font: 'Helvetica',
              bold: false,
              oblique: false,
              alignment: 'left'
            }
          },
          batchSize: 20
        })
      });
    });

    it('handles bulk mode with custom batch size', async () => {
      const mockSessionId = 'test-session-456';
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessionId: mockSessionId })
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionId: mockSessionId,
          status: 'processing',
          processed: 0,
          failed: 0,
          total: 2,
          currentBatch: 1,
          totalBatches: 1,
          timeElapsed: 0,
          errors: []
        })
      } as Response);

      const { result } = renderHook(() => useProgressivePdfGeneration(defaultProps));

      await act(async () => {
        await result.current.startProgressiveGeneration('bulk', 50);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"batchSize":50')
        })
      );
    });

    it('sets naming column when not provided in individual mode', async () => {
      const propsWithoutNamingColumn = {
        ...defaultProps,
        selectedNamingColumn: ''
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessionId: 'test-session' })
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionId: 'test-session',
          status: 'processing',
          processed: 0,
          failed: 0,
          total: 2,
          currentBatch: 1,
          totalBatches: 1,
          timeElapsed: 0,
          errors: []
        })
      } as Response);

      const { result } = renderHook(() => 
        useProgressivePdfGeneration(propsWithoutNamingColumn)
      );

      await act(async () => {
        await result.current.startProgressiveGeneration('individual');
      });

      expect(mockSetSelectedNamingColumn).toHaveBeenCalledWith('name');
    });

    it('handles API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Template not found' })
      } as Response);

      const { result } = renderHook(() => useProgressivePdfGeneration(defaultProps));

      await act(async () => {
        await result.current.startProgressiveGeneration('individual');
      });

      expect(result.current.isGenerating).toBe(false);
      expect(result.current.error).toBe('Template not found');
    });

    it('filters out hidden fields', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessionId: 'test-session' })
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionId: 'test-session',
          status: 'processing',
          processed: 0,
          failed: 0,
          total: 2,
          currentBatch: 1,
          totalBatches: 1,
          timeElapsed: 0,
          errors: []
        })
      } as Response);

      const { result } = renderHook(() => useProgressivePdfGeneration(defaultProps));

      await act(async () => {
        await result.current.startProgressiveGeneration('individual');
      });

      const callBody = JSON.parse(
        (mockFetch.mock.calls[0][1]?.body as string) || '{}'
      );

      // Should only include 'name' field, not 'title' which is hidden
      expect(callBody.positions).toHaveProperty('name');
      expect(callBody.positions).not.toHaveProperty('title');
      expect(callBody.data[0]).toHaveProperty('name');
      expect(callBody.data[0]).not.toHaveProperty('title');
    });
  });

  describe('Progress Polling', () => {
    it('polls for progress updates', async () => {
      const mockSessionId = 'test-session-poll';
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessionId: mockSessionId })
      } as Response);

      // Initial progress
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionId: mockSessionId,
          status: 'processing',
          processed: 0,
          failed: 0,
          total: 2,
          currentBatch: 1,
          totalBatches: 1,
          timeElapsed: 0,
          errors: []
        })
      } as Response);

      // Updated progress
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionId: mockSessionId,
          status: 'processing',
          processed: 1,
          failed: 0,
          total: 2,
          currentBatch: 1,
          totalBatches: 1,
          timeElapsed: 1000,
          errors: []
        })
      } as Response);

      const { result } = renderHook(() => useProgressivePdfGeneration(defaultProps));

      await act(async () => {
        await result.current.startProgressiveGeneration('individual');
      });

      // Fast-forward timer to trigger polling
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(result.current.progress?.processed).toBe(1);
      });
    });

    it('stops polling when generation completes', async () => {
      const mockSessionId = 'test-session-complete';
      const mockResults: PdfGenerationResult = {
        sessionId: mockSessionId,
        status: 'completed',
        files: [
          { index: 0, filename: 'John_Doe.pdf', path: '/pdfs/John_Doe.pdf' },
          { index: 1, filename: 'Jane_Smith.pdf', path: '/pdfs/Jane_Smith.pdf' }
        ],
        errors: [],
        totalProcessed: 2,
        totalFailed: 0
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessionId: mockSessionId })
      } as Response);

      // Initial progress
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionId: mockSessionId,
          status: 'processing',
          processed: 0,
          failed: 0,
          total: 2,
          currentBatch: 1,
          totalBatches: 1,
          timeElapsed: 0,
          errors: []
        })
      } as Response);

      // Completed progress with results
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionId: mockSessionId,
          status: 'completed',
          processed: 2,
          failed: 0,
          total: 2,
          currentBatch: 1,
          totalBatches: 1,
          timeElapsed: 2000,
          errors: [],
          results: mockResults
        })
      } as Response);

      const { result } = renderHook(() => useProgressivePdfGeneration(defaultProps));

      await act(async () => {
        await result.current.startProgressiveGeneration('individual');
      });

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(result.current.isGenerating).toBe(false);
        expect(result.current.results).toEqual(mockResults);
      });

      // Verify no more polling calls
      const initialCallCount = mockFetch.mock.calls.length;
      act(() => {
        jest.advanceTimersByTime(5000);
      });
      expect(mockFetch.mock.calls.length).toBe(initialCallCount);
    });

    it('handles polling error', async () => {
      const mockSessionId = 'test-session-error';
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessionId: mockSessionId })
      } as Response);

      // Initial success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionId: mockSessionId,
          status: 'processing',
          processed: 0,
          failed: 0,
          total: 2,
          currentBatch: 1,
          totalBatches: 1,
          timeElapsed: 0,
          errors: []
        })
      } as Response);

      // Polling error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Session expired' })
      } as Response);

      const { result } = renderHook(() => useProgressivePdfGeneration(defaultProps));

      await act(async () => {
        await result.current.startProgressiveGeneration('individual');
      });

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(result.current.isGenerating).toBe(false);
        expect(result.current.error).toBe('Failed to get progress');
      });
    });
  });

  describe('pauseGeneration', () => {
    it('pauses generation and stops polling', async () => {
      const mockSessionId = 'test-session-pause';
      
      // Setup initial generation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessionId: mockSessionId })
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionId: mockSessionId,
          status: 'processing',
          processed: 1,
          failed: 0,
          total: 2,
          currentBatch: 1,
          totalBatches: 1,
          timeElapsed: 1000,
          errors: []
        })
      } as Response);

      // Pause response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      } as Response);

      const { result } = renderHook(() => useProgressivePdfGeneration(defaultProps));

      await act(async () => {
        await result.current.startProgressiveGeneration('individual');
      });

      await act(async () => {
        await result.current.pauseGeneration();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        `/api/generate-progressive?sessionId=${mockSessionId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'pause' })
        }
      );

      // Verify polling stopped by advancing timers
      const callCount = mockFetch.mock.calls.length;
      act(() => {
        jest.advanceTimersByTime(5000);
      });
      expect(mockFetch.mock.calls.length).toBe(callCount);
    });

    it('handles pause error', async () => {
      const mockSessionId = 'test-session-pause-error';
      
      // Setup initial generation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessionId: mockSessionId })
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionId: mockSessionId,
          status: 'processing',
          processed: 1,
          failed: 0,
          total: 2,
          currentBatch: 1,
          totalBatches: 1,
          timeElapsed: 1000,
          errors: []
        })
      } as Response);

      // Pause error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Cannot pause' })
      } as Response);

      const { result } = renderHook(() => useProgressivePdfGeneration(defaultProps));

      await act(async () => {
        await result.current.startProgressiveGeneration('individual');
      });

      await act(async () => {
        await result.current.pauseGeneration();
      });

      expect(result.current.error).toBe('Failed to pause generation');
    });
  });

  describe('resumeGeneration', () => {
    it('resumes generation and restarts polling', async () => {
      const mockSessionId = 'test-session-resume';
      
      // Initial setup and pause
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessionId: mockSessionId })
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionId: mockSessionId,
          status: 'processing',
          processed: 1,
          failed: 0,
          total: 2,
          currentBatch: 1,
          totalBatches: 1,
          timeElapsed: 1000,
          errors: []
        })
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      } as Response);

      // Resume response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      } as Response);

      // Progress after resume
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionId: mockSessionId,
          status: 'processing',
          processed: 2,
          failed: 0,
          total: 2,
          currentBatch: 1,
          totalBatches: 1,
          timeElapsed: 2000,
          errors: []
        })
      } as Response);

      const { result } = renderHook(() => useProgressivePdfGeneration(defaultProps));

      await act(async () => {
        await result.current.startProgressiveGeneration('individual');
      });

      await act(async () => {
        await result.current.pauseGeneration();
      });

      await act(async () => {
        await result.current.resumeGeneration();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        `/api/generate-progressive?sessionId=${mockSessionId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'resume' })
        }
      );

      // Verify polling resumed
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(result.current.progress?.processed).toBe(2);
      });
    });
  });

  describe('cancelGeneration', () => {
    it('cancels generation and clears state', async () => {
      const mockSessionId = 'test-session-cancel';
      
      // Setup initial generation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessionId: mockSessionId })
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionId: mockSessionId,
          status: 'processing',
          processed: 1,
          failed: 0,
          total: 2,
          currentBatch: 1,
          totalBatches: 1,
          timeElapsed: 1000,
          errors: []
        })
      } as Response);

      // Cancel response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      } as Response);

      const { result } = renderHook(() => useProgressivePdfGeneration(defaultProps));

      await act(async () => {
        await result.current.startProgressiveGeneration('individual');
      });

      await act(async () => {
        await result.current.cancelGeneration();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        `/api/generate-progressive?sessionId=${mockSessionId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'cancel' })
        }
      );

      expect(result.current.isGenerating).toBe(false);
      
      // Verify polling stopped
      const callCount = mockFetch.mock.calls.length;
      act(() => {
        jest.advanceTimersByTime(5000);
      });
      expect(mockFetch.mock.calls.length).toBe(callCount);
    });
  });

  describe('clearResults', () => {
    it('clears all state and stops polling', async () => {
      const mockSessionId = 'test-session-clear';
      const mockResults: PdfGenerationResult = {
        sessionId: mockSessionId,
        status: 'completed',
        files: [{ index: 0, filename: 'test.pdf', path: '/test.pdf' }],
        errors: [],
        totalProcessed: 1,
        totalFailed: 0
      };

      // Setup with completed generation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessionId: mockSessionId })
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionId: mockSessionId,
          status: 'completed',
          processed: 1,
          failed: 0,
          total: 1,
          currentBatch: 1,
          totalBatches: 1,
          timeElapsed: 1000,
          errors: [],
          results: mockResults
        })
      } as Response);

      const { result } = renderHook(() => useProgressivePdfGeneration(defaultProps));

      await act(async () => {
        await result.current.startProgressiveGeneration('individual');
      });

      await waitFor(() => {
        expect(result.current.results).toEqual(mockResults);
      });

      act(() => {
        result.current.clearResults();
      });

      expect(result.current.progress).toBeNull();
      expect(result.current.results).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.isGenerating).toBe(false);
    });
  });

  describe('Cleanup', () => {
    it('clears interval on unmount', async () => {
      const mockSessionId = 'test-session-unmount';
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessionId: mockSessionId })
      } as Response);

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          sessionId: mockSessionId,
          status: 'processing',
          processed: 0,
          failed: 0,
          total: 2,
          currentBatch: 1,
          totalBatches: 1,
          timeElapsed: 0,
          errors: []
        })
      } as Response);

      const { result, unmount } = renderHook(() => 
        useProgressivePdfGeneration(defaultProps)
      );

      await act(async () => {
        await result.current.startProgressiveGeneration('individual');
      });

      const callCountBeforeUnmount = mockFetch.mock.calls.length;

      unmount();

      // Advance timers after unmount
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      // No new calls should be made after unmount
      expect(mockFetch.mock.calls.length).toBe(callCountBeforeUnmount);
    });
  });

  describe('Edge Cases', () => {
    it('handles string uploadedFile (filename)', async () => {
      const propsWithStringFile = {
        ...defaultProps,
        uploadedFile: 'existing-template.pdf'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessionId: 'test-session' })
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionId: 'test-session',
          status: 'processing',
          processed: 0,
          failed: 0,
          total: 2,
          currentBatch: 1,
          totalBatches: 1,
          timeElapsed: 0,
          errors: []
        })
      } as Response);

      const { result } = renderHook(() => 
        useProgressivePdfGeneration(propsWithStringFile)
      );

      await act(async () => {
        await result.current.startProgressiveGeneration('individual');
      });

      const callBody = JSON.parse(
        (mockFetch.mock.calls[0][1]?.body as string) || '{}'
      );
      expect(callBody.templateFilename).toBe('existing-template.pdf');
    });

    it('uses fallback dimensions when container not found', async () => {
      // Remove the mock image element
      document.body.innerHTML = '';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessionId: 'test-session' })
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionId: 'test-session',
          status: 'processing',
          processed: 0,
          failed: 0,
          total: 2,
          currentBatch: 1,
          totalBatches: 1,
          timeElapsed: 0,
          errors: []
        })
      } as Response);

      const { result } = renderHook(() => useProgressivePdfGeneration(defaultProps));

      await act(async () => {
        await result.current.startProgressiveGeneration('individual');
      });

      const callBody = JSON.parse(
        (mockFetch.mock.calls[0][1]?.body as string) || '{}'
      );
      expect(callBody.uiContainerDimensions).toEqual({ width: 600, height: 400 });
    });

    it('handles color parsing fallback', async () => {
      const positionsWithInvalidColor: Positions = {
        name: { x: 50, y: 50, color: 'invalid-color' }
      };

      const propsWithInvalidColor = {
        ...defaultProps,
        positions: positionsWithInvalidColor
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessionId: 'test-session' })
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionId: 'test-session',
          status: 'processing',
          processed: 0,
          failed: 0,
          total: 2,
          currentBatch: 1,
          totalBatches: 1,
          timeElapsed: 0,
          errors: []
        })
      } as Response);

      const { result } = renderHook(() => 
        useProgressivePdfGeneration(propsWithInvalidColor)
      );

      await act(async () => {
        await result.current.startProgressiveGeneration('individual');
      });

      const callBody = JSON.parse(
        (mockFetch.mock.calls[0][1]?.body as string) || '{}'
      );
      // Should fall back to black [0, 0, 0]
      expect(callBody.data[0].name.color).toEqual([0, 0, 0]);
    });
  });
});