import { createMocks } from 'node-mocks-http';
import { generateSinglePdf } from '@/lib/pdf-generator';
import { uploadToR2 } from '@/lib/r2-client';
import storageConfig from '@/lib/storage-config';
import fs from 'fs/promises';
import path from 'path';

// Mock dependencies
jest.mock('@/lib/pdf-generator');
jest.mock('@/lib/r2-client');
jest.mock('@/lib/storage-config', () => ({
  __esModule: true,
  default: { isR2Enabled: false }
}));
jest.mock('fs/promises');
jest.mock('uuid', () => ({
  v4: () => 'mock-uuid-1234'
}));

// Create mock functions
const mockCreateSession = jest.fn();
const mockGetSession = jest.fn();
const mockRemoveSession = jest.fn();

// Mock the session manager
jest.mock('@/lib/pdf/session-manager');

// Import modules after basic mocks
import { PdfSessionManager } from '@/lib/pdf/session-manager';
import handler from '@/pages/api/generate-progressive';

// Set up the mock implementation
(PdfSessionManager.getInstance as jest.Mock).mockReturnValue({
  createSession: mockCreateSession,
  getSession: mockGetSession,
  removeSession: mockRemoveSession
});

describe('/api/generate-progressive', () => {
  let mockQueueManager: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Create fresh mocks for each test
    mockQueueManager = {
      initializeQueue: jest.fn(),
      startProcessing: jest.fn(),
      getProgress: jest.fn(),
      getResults: jest.fn(),
      getQueue: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      cancel: jest.fn(),
      processNextBatch: jest.fn()
    };
    
    // Reset the session manager mocks
    mockCreateSession.mockReturnValue(mockQueueManager);
    mockGetSession.mockReturnValue(mockQueueManager);
    mockRemoveSession.mockClear();
    
    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fs.readFile as jest.Mock).mockResolvedValue(Buffer.from('mock-pdf-content'));
    (fs.unlink as jest.Mock).mockResolvedValue(undefined);
    (generateSinglePdf as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('POST - Start generation', () => {
    const validRequestBody = {
      templateFilename: 'template.pdf',
      data: [
        { name: 'John Doe', title: 'Certificate of Excellence' },
        { name: 'Jane Smith', title: 'Achievement Award' }
      ],
      positions: {
        name: { x: 0.5, y: 0.3, fontSize: 24, font: 'Helvetica' },
        title: { x: 0.5, y: 0.7, fontSize: 18, font: 'Times' }
      },
      uiContainerDimensions: { width: 800, height: 600 },
      mode: 'individual',
      namingColumn: 'name',
      batchSize: 20
    };

    it('starts a new PDF generation session', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: validRequestBody
      });

      mockQueueManager.getQueue.mockReturnValue({
        status: 'processing',
        mode: 'individual',
        templateFile: 'template.pdf'
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({
        sessionId: expect.stringContaining('pdf-'),
        status: 'started',
        total: 2,
        batchSize: 20,
        message: 'PDF generation started'
      });

      expect(mockCreateSession).toHaveBeenCalledWith(
        expect.stringContaining('pdf-'),
        'template.pdf',
        validRequestBody.positions,
        validRequestBody.uiContainerDimensions,
        'individual',
        { batchSize: 20 }
      );

      expect(mockQueueManager.initializeQueue).toHaveBeenCalledWith(
        validRequestBody.data,
        'name'
      );

      expect(mockQueueManager.startProcessing).toHaveBeenCalled();
    });

    it('creates session directory for individual mode', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: validRequestBody
      });

      mockQueueManager.getQueue.mockReturnValue({
        status: 'processing',
        mode: 'individual',
        templateFile: 'template.pdf'
      });

      await handler(req, res);

      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('progressive_pdf-'),
        { recursive: true }
      );
    });

    it('validates required fields', async () => {
      const invalidBodies = [
        { ...validRequestBody, templateFilename: undefined },
        { ...validRequestBody, data: undefined },
        { ...validRequestBody, positions: undefined },
        { ...validRequestBody, uiContainerDimensions: undefined }
      ];

      for (const body of invalidBodies) {
        const { req, res } = createMocks({
          method: 'POST',
          body
        });

        await handler(req, res);

        expect(res._getStatusCode()).toBe(400);
        expect(res._getJSONData()).toEqual({
          error: 'Missing required fields'
        });
      }
    });

    it('validates data is non-empty array', async () => {
      const invalidDataBodies = [
        { ...validRequestBody, data: [] },
        { ...validRequestBody, data: 'not-an-array' }
      ];

      for (const body of invalidDataBodies) {
        const { req, res } = createMocks({
          method: 'POST',
          body
        });

        await handler(req, res);

        expect(res._getStatusCode()).toBe(400);
        expect(res._getJSONData()).toEqual({
          error: 'Data must be a non-empty array'
        });
      }
    });

    it('cleans up session on error', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: validRequestBody
      });

      mockQueueManager.initializeQueue.mockRejectedValue(new Error('Init failed'));

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      expect(mockRemoveSession).toHaveBeenCalledWith(
        expect.stringContaining('pdf-')
      );
    });

    it('uses default batch size when not provided', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          ...validRequestBody,
          batchSize: undefined
        }
      });

      mockQueueManager.getQueue.mockReturnValue({
        status: 'processing',
        mode: 'individual',
        templateFile: 'template.pdf'
      });

      await handler(req, res);

      expect(mockCreateSession).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Object),
        expect.any(Object),
        expect.any(String),
        { batchSize: 20 }
      );
    });
  });

  describe('GET - Get progress', () => {
    it('returns progress for active session', async () => {
      const mockProgress = {
        sessionId: 'pdf-12345',
        status: 'processing',
        processed: 5,
        failed: 1,
        total: 10,
        currentBatch: 1,
        totalBatches: 2,
        timeElapsed: 5000,
        errors: []
      };

      mockQueueManager.getProgress.mockReturnValue(mockProgress);

      const { req, res } = createMocks({
        method: 'GET',
        query: { sessionId: 'pdf-12345' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual(mockProgress);
    });

    it('returns results for completed session', async () => {
      const mockProgress = {
        sessionId: 'pdf-12345',
        status: 'completed',
        processed: 10,
        failed: 0,
        total: 10,
        currentBatch: 2,
        totalBatches: 2,
        timeElapsed: 10000,
        errors: []
      };

      const mockResults = {
        sessionId: 'pdf-12345',
        status: 'completed',
        files: [
          { index: 0, filename: 'John_Doe.pdf', path: '/pdfs/John_Doe.pdf' }
        ],
        errors: [],
        totalProcessed: 10,
        totalFailed: 0
      };

      mockQueueManager.getProgress.mockReturnValue(mockProgress);
      mockQueueManager.getResults.mockReturnValue(mockResults);

      const { req, res } = createMocks({
        method: 'GET',
        query: { sessionId: 'pdf-12345' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({
        ...mockProgress,
        results: mockResults
      });
    });

    it('returns error for missing session ID', async () => {
      const { req, res } = createMocks({
        method: 'GET',
        query: {}
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData()).toEqual({
        error: 'Session ID required'
      });
    });

    it('returns 404 for non-existent session', async () => {
      mockGetSession.mockReturnValue(null);

      const { req, res } = createMocks({
        method: 'GET',
        query: { sessionId: 'non-existent' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
      expect(res._getJSONData()).toEqual({
        error: 'Session not found'
      });
    });
  });

  describe('PUT - Control session', () => {
    it('pauses session', async () => {
      const { req, res } = createMocks({
        method: 'PUT',
        query: { sessionId: 'pdf-12345' },
        body: { action: 'pause' }
      });

      mockQueueManager.getProgress.mockReturnValue({ status: 'paused' });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({
        sessionId: 'pdf-12345',
        action: 'pause',
        status: 'paused'
      });

      expect(mockQueueManager.pause).toHaveBeenCalled();
    });

    it('resumes session and continues processing', async () => {
      const { req, res } = createMocks({
        method: 'PUT',
        query: { sessionId: 'pdf-12345' },
        body: { action: 'resume' }
      });

      mockQueueManager.getProgress.mockReturnValue({ status: 'processing' });
      mockQueueManager.getQueue.mockReturnValue({
        status: 'processing',
        mode: 'individual',
        templateFile: 'template.pdf'
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({
        sessionId: 'pdf-12345',
        action: 'resume',
        status: 'processing'
      });

      expect(mockQueueManager.resume).toHaveBeenCalled();
      
      // Verify processing continues
      jest.runOnlyPendingTimers();
      expect(mockQueueManager.processNextBatch).toHaveBeenCalled();
    });

    it('cancels session and removes it', async () => {
      const { req, res } = createMocks({
        method: 'PUT',
        query: { sessionId: 'pdf-12345' },
        body: { action: 'cancel' }
      });

      mockQueueManager.getProgress.mockReturnValue({ status: 'cancelled' });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(mockQueueManager.cancel).toHaveBeenCalled();
      expect(mockRemoveSession).toHaveBeenCalledWith('pdf-12345');
    });

    it('validates session ID', async () => {
      const { req, res } = createMocks({
        method: 'PUT',
        query: {},
        body: { action: 'pause' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData()).toEqual({
        error: 'Session ID required'
      });
    });

    it('validates action', async () => {
      const invalidActions = ['invalid', '', null, undefined];

      for (const action of invalidActions) {
        const { req, res } = createMocks({
          method: 'PUT',
          query: { sessionId: 'pdf-12345' },
          body: { action }
        });

        await handler(req, res);

        expect(res._getStatusCode()).toBe(400);
        expect(res._getJSONData()).toEqual({
          error: 'Invalid action'
        });
      }
    });

    it('returns 404 for non-existent session', async () => {
      mockGetSession.mockReturnValue(null);

      const { req, res } = createMocks({
        method: 'PUT',
        query: { sessionId: 'non-existent' },
        body: { action: 'pause' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
      expect(res._getJSONData()).toEqual({
        error: 'Session not found'
      });
    });

    it('handles action errors', async () => {
      mockQueueManager.pause.mockRejectedValue(new Error('Cannot pause'));

      const { req, res } = createMocks({
        method: 'PUT',
        query: { sessionId: 'pdf-12345' },
        body: { action: 'pause' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData()).toEqual({
        error: 'Cannot pause'
      });
    });
  });

  describe('Method validation', () => {
    it('returns 405 for unsupported methods', async () => {
      const unsupportedMethods = ['DELETE', 'PATCH', 'HEAD'];

      for (const method of unsupportedMethods) {
        const { req, res } = createMocks({ method });

        await handler(req, res);

        expect(res._getStatusCode()).toBe(405);
        expect(res._getJSONData()).toEqual({
          error: 'Method not allowed'
        });
      }
    });
  });

  describe('Batch processing', () => {
    it('processes PDFs in individual mode', async () => {
      const mockQueue = {
        status: 'processing',
        mode: 'individual',
        templateFile: 'template.pdf',
        namingColumn: 'name',
        positions: { name: { x: 0.5, y: 0.5 } },
        uiContainerDimensions: { width: 800, height: 600 }
      };

      const mockItems = [
        { id: '1', index: 0, data: { name: 'John Doe' }, status: 'pending' }
      ];

      mockQueueManager.getQueue.mockReturnValue(mockQueue);
      mockQueueManager.processNextBatch.mockImplementation(async (processFn) => {
        const result = await processFn(mockItems[0]);
        return {
          completed: [{ ...mockItems[0], outputPath: result.path }],
          failed: []
        };
      });

      mockQueueManager.getProgress.mockReturnValue({
        status: 'processing',
        processed: 1,
        failed: 0,
        total: 2
      });

      // Start generation
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          templateFilename: 'template.pdf',
          data: [{ name: 'John Doe' }, { name: 'Jane Smith' }],
          positions: { name: { x: 0.5, y: 0.5 } },
          uiContainerDimensions: { width: 800, height: 600 },
          mode: 'individual',
          namingColumn: 'name'
        }
      });

      await handler(req, res);

      // Trigger batch processing
      jest.runOnlyPendingTimers();

      expect(generateSinglePdf).toHaveBeenCalledWith(
        expect.stringContaining('template.pdf'),
        { name: 'John Doe' },
        { name: { x: 0.5, y: 0.5 } },
        { width: 800, height: 600 },
        expect.stringContaining('John_Doe.pdf')
      );
    });

    it('handles R2 upload when enabled', async () => {
      (storageConfig as any).isR2Enabled = true;
      (uploadToR2 as jest.Mock).mockResolvedValue({
        url: 'https://r2.example.com/generated/John_Doe.pdf'
      });

      const mockQueue = {
        status: 'processing',
        mode: 'individual',
        templateFile: 'template.pdf',
        namingColumn: 'name',
        positions: { name: { x: 0.5, y: 0.5 } },
        uiContainerDimensions: { width: 800, height: 600 }
      };

      const mockItems = [
        { id: '1', index: 0, data: { name: 'John Doe' }, status: 'pending' }
      ];

      mockQueueManager.getQueue.mockReturnValue(mockQueue);
      mockQueueManager.processNextBatch.mockImplementation(async (processFn) => {
        const result = await processFn(mockItems[0]);
        return {
          completed: [{ ...mockItems[0], outputPath: result.path }],
          failed: []
        };
      });

      mockQueueManager.getProgress.mockReturnValue({
        status: 'completed',
        processed: 1,
        failed: 0,
        total: 1
      });

      // Start generation
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          templateFilename: 'template.pdf',
          data: [{ name: 'John Doe' }],
          positions: { name: { x: 0.5, y: 0.5 } },
          uiContainerDimensions: { width: 800, height: 600 },
          mode: 'individual',
          namingColumn: 'name'
        }
      });

      await handler(req, res);

      // Trigger batch processing
      jest.runOnlyPendingTimers();

      expect(uploadToR2).toHaveBeenCalledWith(
        Buffer.from('mock-pdf-content'),
        expect.stringContaining('John_Doe.pdf'),
        'application/pdf',
        'John_Doe.pdf'
      );

      expect(fs.unlink).toHaveBeenCalledWith(
        expect.stringContaining('John_Doe.pdf')
      );

      // Reset R2 config
      (storageConfig as any).isR2Enabled = false;
    });

    it('continues processing next batch', async () => {
      const mockQueue = {
        status: 'processing',
        mode: 'individual',
        templateFile: 'template.pdf'
      };

      mockQueueManager.getQueue.mockReturnValue(mockQueue);
      mockQueueManager.processNextBatch
        .mockResolvedValueOnce({ completed: [{}], failed: [] })
        .mockResolvedValueOnce({ completed: [{}], failed: [] });

      mockQueueManager.getProgress
        .mockReturnValueOnce({
          status: 'processing',
          processed: 1,
          failed: 0,
          total: 3
        })
        .mockReturnValueOnce({
          status: 'processing',
          processed: 2,
          failed: 0,
          total: 3
        })
        .mockReturnValue({
          status: 'completed',
          processed: 3,
          failed: 0,
          total: 3
        });

      // Start generation
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          templateFilename: 'template.pdf',
          data: [{}, {}, {}],
          positions: {},
          uiContainerDimensions: { width: 800, height: 600 }
        }
      });

      await handler(req, res);

      // Process all batches
      for (let i = 0; i < 3; i++) {
        jest.runOnlyPendingTimers();
        await Promise.resolve();
      }

      expect(mockQueueManager.processNextBatch).toHaveBeenCalledTimes(3);
    });

    it('handles batch processing errors', async () => {
      const mockQueue = {
        status: 'processing',
        mode: 'individual',
        templateFile: 'template.pdf'
      };

      mockQueueManager.getQueue.mockReturnValue(mockQueue);
      mockQueueManager.processNextBatch.mockRejectedValue(
        new Error('Processing failed')
      );

      // Start generation
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          templateFilename: 'template.pdf',
          data: [{}],
          positions: {},
          uiContainerDimensions: { width: 800, height: 600 }
        }
      });

      await handler(req, res);

      // Trigger batch processing
      jest.runOnlyPendingTimers();
      await Promise.resolve();

      expect(mockQueueManager.cancel).toHaveBeenCalled();
    });

    it('sanitizes filenames for PDF output', async () => {
      const mockQueue = {
        status: 'processing',
        mode: 'individual',
        templateFile: 'template.pdf',
        namingColumn: 'name',
        positions: {},
        uiContainerDimensions: { width: 800, height: 600 }
      };

      const mockItems = [
        { 
          id: '1', 
          index: 0, 
          data: { name: 'John/Doe*Special<>Characters' }, 
          status: 'pending' 
        }
      ];

      mockQueueManager.getQueue.mockReturnValue(mockQueue);
      mockQueueManager.processNextBatch.mockImplementation(async (processFn) => {
        const result = await processFn(mockItems[0]);
        expect(result.filename).toBe('John_Doe_Special__Characters.pdf');
        return { completed: [], failed: [] };
      });

      mockQueueManager.getProgress.mockReturnValue({
        status: 'completed',
        processed: 1,
        failed: 0,
        total: 1
      });

      // Start generation
      const { req, res } = createMocks({
        method: 'POST',
        body: {
          templateFilename: 'template.pdf',
          data: [{ name: 'John/Doe*Special<>Characters' }],
          positions: {},
          uiContainerDimensions: { width: 800, height: 600 },
          mode: 'individual',
          namingColumn: 'name'
        }
      });

      await handler(req, res);

      // Trigger batch processing
      jest.runOnlyPendingTimers();
    });
  });

  describe('Error handling', () => {
    it('returns 500 for internal errors', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: {}
      });

      // Force an error by making body undefined
      req.body = undefined;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      expect(res._getJSONData()).toHaveProperty('error', 'Internal server error');
    });
  });
});