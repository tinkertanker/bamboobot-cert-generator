import { renderHook, act, waitFor } from '@testing-library/react';
import { useFileUpload } from '@/hooks/useFileUpload';
import { ERROR_MESSAGES } from '@/utils/errorMessages';

// Mock fetch globally
global.fetch = jest.fn();

// Mock URL.createObjectURL and URL.revokeObjectURL
global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = jest.fn();

// Mock ImageToPdfConverter
jest.mock('@/lib/pdf/client/image-to-pdf', () => ({
  ImageToPdfConverter: {
    convertImageToPdf: jest.fn().mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }))
  }
}));

describe('useFileUpload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockReset();
    (global.URL.createObjectURL as jest.Mock).mockClear();
    (global.URL.revokeObjectURL as jest.Mock).mockClear();
  });

  it('should initialize with default values', () => {
    const { result } = renderHook(() => useFileUpload());

    expect(result.current.uploadedFile).toBeNull();
    expect(result.current.uploadedFileUrl).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isDraggingFile).toBe(false);
    expect(result.current.uploadError).toBeNull();
  });

  describe('processFile', () => {
    it('should process valid image file successfully', async () => {
      const { result } = renderHook(() => useFileUpload());
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      await act(async () => {
        // Process file with skipUpload=true (default behavior)
        await result.current.processFile(file, false, true);
      });

      // File should be stored locally, not uploaded
      expect(result.current.uploadedFile).toBe(file);
      expect(result.current.uploadedFileUrl).toBe('blob:mock-url');
      expect(result.current.localBlobUrl).toBe('blob:mock-url');
      expect(result.current.uploadError).toBeNull();
      // Should NOT upload immediately
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should upload to server when explicitly requested', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          filename: 'template.pdf',
          image: '/template_images/template.jpg',
          isTemplate: true,
          storageType: 'r2'
        })
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useFileUpload());
      const file = new File(['test'], 'template.png', { type: 'image/png' });

      // First process the file locally
      await act(async () => {
        await result.current.processFile(file, true, true);
      });

      expect(global.fetch).not.toHaveBeenCalled();

      // Then explicitly upload to server
      await act(async () => {
        await result.current.uploadToServer();
      });

      expect(global.fetch).toHaveBeenCalledWith('/api/upload', {
        method: 'POST',
        body: expect.any(FormData)
      });
      expect(result.current.uploadedFile).toBe('template.pdf');
      expect(result.current.uploadedFileUrl).toBe('/template_images/template.jpg');
    });

    it('should reject invalid file types', async () => {
      const { result } = renderHook(() => useFileUpload());
      const file = new File(['test'], 'test.txt', { type: 'text/plain' });

      await act(async () => {
        await result.current.processFile(file);
      });

      expect(result.current.uploadError).toEqual(ERROR_MESSAGES.INVALID_FILE_TYPE);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should reject files larger than 10MB', async () => {
      const { result } = renderHook(() => useFileUpload());
      const largeContent = new Array(11 * 1024 * 1024).fill('a').join('');
      const file = new File([largeContent], 'large.jpg', { type: 'image/jpeg' });

      await act(async () => {
        await result.current.processFile(file);
      });

      expect(result.current.uploadError).toEqual(ERROR_MESSAGES.FILE_TOO_LARGE);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle upload errors', async () => {
      const mockResponse = {
        ok: false,
        statusText: 'Internal Server Error'
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useFileUpload());
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      // First process locally
      await act(async () => {
        await result.current.processFile(file, false, true);
      });

      // Then try to upload and fail
      await act(async () => {
        try {
          await result.current.uploadToServer();
        } catch (error) {
          // Expected to throw
        }
      });

      expect(result.current.uploadError).toEqual(ERROR_MESSAGES.UPLOAD_FAILED);
    });

    it('should handle network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useFileUpload());
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      // First process locally
      await act(async () => {
        await result.current.processFile(file, false, true);
      });

      // Then try to upload and fail
      await act(async () => {
        try {
          await result.current.uploadToServer();
        } catch (error) {
          // Expected to throw
        }
      });

      expect(result.current.uploadError).toEqual(ERROR_MESSAGES.UPLOAD_FAILED);
    });

    it.skip('should set loading state during upload', async () => {
      let resolvePromise: (value: any) => void;
      const uploadPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      (global.fetch as jest.Mock).mockReturnValue(uploadPromise);

      const { result } = renderHook(() => useFileUpload());
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      // Start upload without awaiting immediately
      act(() => {
        result.current.processFile(file);
      });

      // Wait for loading state to be set
      await waitFor(() => {
        expect(result.current.isLoading).toBe(true);
      });

      // Resolve upload
      await act(async () => {
        resolvePromise!({
          ok: true,
          json: jest.fn().mockResolvedValue({
            filename: 'test.pdf',
            image: '/temp_images/test.jpg'
          })
        });
      });

      // Wait for loading to complete
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });
  });

  describe('handleFileUpload', () => {
    it('should process file from input change event', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          filename: 'test.pdf',
          image: '/temp_images/test.jpg'
        })
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useFileUpload());
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      const event = { target: { files: [file] } } as any;

      await act(async () => {
        await result.current.handleFileUpload(event);
      });

      expect(result.current.uploadedFile).toBe(file);
      expect(result.current.uploadedFileUrl).toBe('blob:mock-url');
    });

    it('should handle empty file input', async () => {
      const { result } = renderHook(() => useFileUpload());
      const event = { target: { files: [] } } as any;

      await act(async () => {
        await result.current.handleFileUpload(event);
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('drag and drop handlers', () => {
    it('should handle drag over', () => {
      const { result } = renderHook(() => useFileUpload());
      const event = {
        preventDefault: jest.fn(),
        stopPropagation: jest.fn()
      } as any;

      act(() => {
        result.current.handleDragOver(event);
      });

      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopPropagation).toHaveBeenCalled();
      expect(result.current.isDraggingFile).toBe(true);
    });

    it('should handle drag leave', () => {
      const { result } = renderHook(() => useFileUpload());
      const event = {
        preventDefault: jest.fn(),
        stopPropagation: jest.fn()
      } as any;

      // First set dragging to true
      act(() => {
        result.current.handleDragOver(event);
      });

      // Then handle drag leave
      act(() => {
        result.current.handleDragLeave(event);
      });

      expect(result.current.isDraggingFile).toBe(false);
    });

    it('should handle file drop', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          filename: 'test.pdf',
          image: '/temp_images/test.jpg'
        })
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useFileUpload());
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      const event = {
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        dataTransfer: { files: [file] }
      } as any;

      await act(async () => {
        await result.current.handleFileDrop(event);
      });

      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopPropagation).toHaveBeenCalled();
      expect(result.current.isDraggingFile).toBe(false);
      expect(result.current.uploadedFile).toBe(file);
      expect(result.current.uploadedFileUrl).toBe('blob:mock-url');
    });
  });

  describe('utility functions', () => {
    it('should clear file', () => {
      const { result } = renderHook(() => useFileUpload());

      // Set some values first
      act(() => {
        result.current.setUploadedFile('test.pdf');
        result.current.setUploadedFileUrl('/temp_images/test.jpg');
      });

      expect(result.current.uploadedFile).toBe('test.pdf');
      expect(result.current.uploadedFileUrl).toBe('/temp_images/test.jpg');

      // Clear file
      act(() => {
        result.current.clearFile();
      });

      expect(result.current.uploadedFile).toBeNull();
      expect(result.current.uploadedFileUrl).toBeNull();
    });

    it('should clear error', async () => {
      const { result } = renderHook(() => useFileUpload());
      const file = new File(['test'], 'test.txt', { type: 'text/plain' });

      // Generate an error
      await act(async () => {
        await result.current.processFile(file);
      });

      expect(result.current.uploadError).not.toBeNull();

      // Clear error
      act(() => {
        result.current.clearError();
      });

      expect(result.current.uploadError).toBeNull();
    });
  });
});